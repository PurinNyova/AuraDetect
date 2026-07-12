from __future__ import annotations

import argparse
import math

from .artifacts import load_checkpoint, save_artifacts, save_checkpoint

import torch
from torch.cuda.amp import GradScaler
from torch.optim import AdamW
from torch.optim.lr_scheduler import LambdaLR

from .cli import parse_args
from .data import build_dataloaders
from .engine import run_phase
from .model import build_model


# Thesis-level success constraint (BAB 1 §1.3). The detector must operate with
# a false positive rate below this ceiling on the validation set; reported as
# a warning per epoch so training logs surface the constraint directly.
FPR_CONSTRAINT = 0.15


def build_scheduler(
    optimizer: AdamW,
    total_training_steps: int,
    warmup_steps: int,
    cosine_decay_strength: float,
    scheduler: str,
) -> LambdaLR | None:
    if total_training_steps <= 0:
        return None

    warmup_steps = min(warmup_steps, total_training_steps)

    if scheduler == "constant":
        def lr_lambda(current_step: int) -> float:
            # Keep base LR constant (optionally with warmup prefix).
            if warmup_steps > 0 and current_step < warmup_steps:
                return float(current_step + 1) / float(warmup_steps)
            return 1.0

        return LambdaLR(optimizer, lr_lambda=lr_lambda)

    if scheduler != "cosine":
        raise ValueError(f"Unsupported scheduler: {scheduler}. Use 'cosine' or 'constant'.")

    decay_steps = max(total_training_steps - warmup_steps, 1)

    def lr_lambda(current_step: int) -> float:
        if warmup_steps > 0 and current_step < warmup_steps:
            return float(current_step + 1) / float(warmup_steps)

        if cosine_decay_strength <= 0.0:
            return 1.0

        decay_progress = (
            min(max(current_step - warmup_steps, 0), decay_steps) / decay_steps
        )
        cosine_value = 0.5 * (1.0 + math.cos(math.pi * decay_progress))
        min_lr_scale = 1.0 - cosine_decay_strength
        return min_lr_scale + cosine_decay_strength * cosine_value

    return LambdaLR(optimizer, lr_lambda=lr_lambda)


def maybe_init_wandb(args: argparse.Namespace):
    if not args.wandb:
        return None, None

    try:
        import wandb
    except ImportError as exc:
        raise RuntimeError(
            "Weights & Biases is not installed. Install the 'wandb' package or run without --wandb."
        ) from exc

    run = wandb.init(
        project=args.wandb_project,
        entity=args.wandb_entity,
        name=args.wandb_run_name,
        mode=args.wandb_mode,
        config={
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "mixed_precision": args.mixed_precision,
            "warmup_steps": args.warmup_steps,
            "cosine_decay_strength": args.cosine_decay_strength,
            "scheduler": args.scheduler,
            "num_workers": args.num_workers,
            "cache_val_preprocessing": args.cache_val_preprocessing,
            "data_dir": str(args.data_dir),
            "output_dir": str(args.output_dir),
            "checkpoint_dir": str(args.checkpoint_dir),
            "checkpoint_every": args.checkpoint_every,
            "resume_from": None if args.resume_from is None else str(args.resume_from),
        },
    )

    # Make epoch-level metrics chart against `epoch` and per-batch step metrics
    # chart against `global_step` so wandb renders clean per-epoch charts for
    # val_loss / val_accuracy / etc. We deliberately do NOT pass `step=` to
    # wandb.log anywhere, because mixing a small epoch-indexed step (1..N) with
    # a large per-batch step (thousands) causes wandb to silently drop the
    # smaller-step entries (steps must be monotonically non-decreasing).
    wandb.define_metric("global_step")
    wandb.define_metric("epoch")
    for step_metric_name in (
        "train_batch",
        "train_batch_size",
        "train_batch_loss",
        "train_learning_rate",
        "val_batch",
        "val_batch_size",
        "val_batch_loss",
        "phase",
        "train_step",
        "val_step",
    ):
        wandb.define_metric(step_metric_name, step_metric="global_step")
    for metric_name in (
        "train_loss",
        "train_accuracy",
        "train_precision",
        "train_recall",
        "train_f1",
        "train_fpr",
        "train_tpr",
        "train_auc",
        "val_loss",
        "val_accuracy",
        "val_precision",
        "val_recall",
        "val_f1",
        "val_fpr",
        "val_tpr",
        "val_auc",
        "val_accuracy_chart",
    ):
        wandb.define_metric(metric_name, step_metric="epoch")

    return wandb, run


def main() -> None:
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_mixed_precision = bool(args.mixed_precision and device.type == "cuda")
    if args.mixed_precision and not use_mixed_precision:
        print("--mixed-precision was requested but CUDA is unavailable; continuing with fp32.")

    print(f"Using device: {device}")
    print(f"Mixed precision: {'enabled' if use_mixed_precision else 'disabled'}")

    wandb, wandb_run = maybe_init_wandb(args)
    global_step = 0
    phase_steps = {"train": 0, "val": 0}

    def make_step_logger(phase: str, epoch: int):
        def log_step(step_metrics: dict[str, float | int]) -> None:
            nonlocal global_step
            if wandb is None:
                return

            global_step += 1
            phase_steps[phase] += 1

            wandb.log(
                {
                    **{f"{phase}_{key}": value for key, value in step_metrics.items()},
                    "phase": phase,
                    "epoch": epoch,
                    "global_step": global_step,
                    f"{phase}_step": phase_steps[phase],
                }
            )

        return log_step

    train_loader, val_loader = build_dataloaders(args)
    model = build_model(device)
    optimizer = AdamW(filter(lambda parameter: parameter.requires_grad, model.parameters()), lr=args.learning_rate)
    scaler = GradScaler(enabled=use_mixed_precision)
    steps_per_epoch = len(train_loader)
    if args.max_train_batches is not None:
        steps_per_epoch = min(steps_per_epoch, args.max_train_batches)
    total_training_steps = steps_per_epoch * args.epochs
    scheduler = build_scheduler(
        optimizer,
        total_training_steps=total_training_steps,
        warmup_steps=args.warmup_steps,
        cosine_decay_strength=args.cosine_decay_strength,
        scheduler=args.scheduler,
    )

    history: list[dict[str, float]] = []
    start_epoch = 1

    if args.resume_from is not None:
        resumed_epoch, history, scheduler_loaded = load_checkpoint(
            args.resume_from,
            model,
            optimizer,
            scheduler,
            device,
            scaler=scaler,
        )
        start_epoch = resumed_epoch + 1

        if scheduler is not None and not scheduler_loaded and resumed_epoch > 0:
            completed_steps = resumed_epoch * steps_per_epoch
            scheduler.step(completed_steps)

        print(f"Resumed from checkpoint: {args.resume_from} (epoch {resumed_epoch})")

        if start_epoch > args.epochs:
            raise ValueError(
                f"Checkpoint epoch {resumed_epoch} is already at or beyond requested --epochs={args.epochs}."
            )

    try:
        for epoch in range(start_epoch, args.epochs + 1):
            train_metrics = run_phase(
                model,
                train_loader,
                optimizer,
                scheduler,
                device,
                train=True,
                phase_name=f"train {epoch}/{args.epochs}",
                mixed_precision=use_mixed_precision,
                scaler=scaler,
                max_batches=args.max_train_batches,
                step_log_fn=make_step_logger("train", epoch),
            )

            val_metrics = run_phase(
                model,
                val_loader,
                optimizer,
                scheduler,
                device,
                train=False,
                phase_name=f"val {epoch}/{args.epochs}",
                mixed_precision=use_mixed_precision,
                max_batches=args.max_val_batches,
                step_log_fn=make_step_logger("val", epoch),
            )

            epoch_metrics = {
                "epoch": epoch,
                **{f"train_{key}": value for key, value in train_metrics.items()},
                **{f"val_{key}": value for key, value in val_metrics.items()},
            }
            history.append(epoch_metrics)

            if wandb is not None:
                wandb.log(epoch_metrics)

                val_accuracy_table = wandb.Table(
                    data=[[entry["epoch"], entry["val_accuracy"]] for entry in history],
                    columns=["epoch", "val_accuracy"],
                )
                wandb.log(
                    {
                        "val_accuracy_chart": wandb.plot.line(
                            val_accuracy_table,
                            "epoch",
                            "val_accuracy",
                            title="Validation Accuracy",
                        ),
                        "epoch": epoch,
                    }
                )

            print(
                " | ".join(
                    [
                        f"epoch={epoch}",
                        f"train_loss={train_metrics['loss']:.4f}",
                        f"train_acc={train_metrics['accuracy']:.4f}",
                        f"train_f1={train_metrics['f1']:.4f}",
                        f"train_fpr={train_metrics['fpr']:.4f}",
                        f"train_auc={train_metrics['auc']:.4f}",
                        f"val_loss={val_metrics['loss']:.4f}",
                        f"val_acc={val_metrics['accuracy']:.4f}",
                        f"val_prec={val_metrics['precision']:.4f}",
                        f"val_rec={val_metrics['recall']:.4f}",
                        f"val_f1={val_metrics['f1']:.4f}",
                        f"val_fpr={val_metrics['fpr']:.4f}",
                        f"val_auc={val_metrics['auc']:.4f}",
                    ]
                )
            )
            if val_metrics["fpr"] > FPR_CONSTRAINT:
                print(
                    f"  [WARN] val_fpr={val_metrics['fpr']:.4f} exceeds FPR constraint "
                    f"({FPR_CONSTRAINT:.2f}) from BAB 1 §1.3"
                )
            else:
                print(f"  [OK]   val_fpr={val_metrics['fpr']:.4f} satisfies FPR constraint ({FPR_CONSTRAINT:.2f})")

            if args.checkpoint_every and epoch % args.checkpoint_every == 0:
                checkpoint_path = save_checkpoint(model, optimizer, scheduler, scaler, args.checkpoint_dir, epoch, history)
                print(f"Saved checkpoint: {checkpoint_path}")

        save_artifacts(model, args.output_dir, history)
    finally:
        if wandb_run is not None:
            wandb_run.finish()
