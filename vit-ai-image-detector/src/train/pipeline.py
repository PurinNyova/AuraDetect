from __future__ import annotations

import argparse
import math
import time
import traceback

import numpy as np

from .artifacts import load_checkpoint, save_artifacts, save_checkpoint

import torch
from torch.cuda.amp import GradScaler
from torch.optim import AdamW
from torch.optim.lr_scheduler import LambdaLR

from .cli import parse_args
from .confusion import save_confusion_matrix
from .data import build_dataloaders
from .engine import run_phase
from .model import build_model


# Wall-clock helper for debug prints. ``flush=True`` ensures the message
# shows up in the terminal immediately when stdout is line-buffered or piped,
# which is essential when something is silently hanging.
def _dbg(msg: str) -> None:
    print(f"[DEBUG {time.strftime('%H:%M:%S')}] {msg}", flush=True)


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
    cosine_flat_period: float = 0.0,
) -> LambdaLR | None:
    """Build the learning rate scheduler for training.

    cosine_decay_strength (used by the ``"cosine"`` scheduler):
        Fraction of the base learning rate that the cosine schedule is allowed
        to decay. The lambda is::

            lr = (1 - cosine_decay_strength) + cosine_decay_strength * 0.5 * (1 + cos(pi * progress))

        where ``progress`` goes from 0 (start of decay) to 1 (end of decay).
        - ``1.0`` (default): LR decays all the way from base to 0.
        - ``0.5``:           LR decays from base to 50% of base.
        - ``0.0``:           LR is pinned to base throughout the decay window
          (the cosine term is multiplied by zero).

    cosine_flat_period (used by the ``"cosine"`` scheduler):
        Percentage of the post-warmup training steps during which the LR is
        held flat at the base value before cosine decay begins. ``0`` (default)
        reproduces the original behavior where decay starts immediately after
        warmup. ``10`` means the LR runs flat for 10% of the post-warmup
        steps, then cosine decay covers the remaining 90%. ``100`` disables
        decay entirely (LR stays at base after warmup). The parameter is
        expressed as a percent in ``[0.0, 100.0]``.

    The ``"constant"`` scheduler ignores ``cosine_decay_strength`` and
    ``cosine_flat_period``.
    """
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

    post_warmup_steps = max(total_training_steps - warmup_steps, 0)
    flat_steps = int(round(cosine_flat_period / 100.0 * post_warmup_steps))
    decay_steps = max(post_warmup_steps - flat_steps, 1)

    def lr_lambda(current_step: int) -> float:
        if warmup_steps > 0 and current_step < warmup_steps:
            return float(current_step + 1) / float(warmup_steps)

        steps_after_warmup = current_step - warmup_steps
        if steps_after_warmup < flat_steps:
            return 1.0

        if cosine_decay_strength <= 0.0:
            return 1.0

        decay_progress = (steps_after_warmup - flat_steps) / decay_steps
        decay_progress = min(max(decay_progress, 0.0), 1.0)
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
            "real_class_weight": args.real_class_weight,
            "ai_class_weight": args.ai_class_weight,
            "mixed_precision": args.mixed_precision,
            "max_grad_norm": args.max_grad_norm,
            "warmup_steps": args.warmup_steps,
            "cosine_decay_strength": args.cosine_decay_strength,
            "cosine_flat_period": args.cosine_flat_period,
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
    _dbg("main() entered")
    args = parse_args()
    _dbg("args parsed")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_mixed_precision = bool(args.mixed_precision and device.type == "cuda")
    if args.mixed_precision and not use_mixed_precision:
        print("--mixed-precision was requested but CUDA is unavailable; continuing with fp32.")

    print(f"Using device: {device}")
    print(f"Mixed precision: {'enabled' if use_mixed_precision else 'disabled'}")
    print(
        f"Class weights: real={args.real_class_weight:.3f}, ai={args.ai_class_weight:.3f}"
    )
    _dbg(f"device ready: {device}, mixed_precision={use_mixed_precision}")

    wandb, wandb_run = maybe_init_wandb(args)
    _dbg(f"wandb init done (enabled={wandb is not None})")
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

    # Index order matches LABEL_TO_ID: real=0, ai=1. Higher real weight makes
    # misclassifying real-as-AI more expensive, which should lower FPR/P(AI).
    class_weights = torch.tensor(
        [args.real_class_weight, args.ai_class_weight],
        dtype=torch.float32,
        device=device,
    )
    _dbg(f"class_weights built: {class_weights.tolist()}")

    _dbg("build_dataloaders() starting...")
    train_loader, val_loader = build_dataloaders(args)
    _dbg(
        f"build_dataloaders() done: train_batches={len(train_loader)}, "
        f"val_batches={len(val_loader)}"
    )

    _dbg("build_model() starting...")
    model = build_model(device)
    _dbg(f"build_model() done: {type(model).__name__}")

    optimizer = AdamW(filter(lambda parameter: parameter.requires_grad, model.parameters()), lr=args.learning_rate)
    _dbg(f"optimizer built: {type(optimizer).__name__}, lr={args.learning_rate}")

    scaler = GradScaler(enabled=use_mixed_precision)
    steps_per_epoch = len(train_loader)
    if args.max_train_batches is not None:
        steps_per_epoch = min(steps_per_epoch, args.max_train_batches)
    total_training_steps = steps_per_epoch * args.epochs
    _dbg(
        f"steps_per_epoch={steps_per_epoch}, total_training_steps={total_training_steps}"
    )

    scheduler = build_scheduler(
        optimizer,
        total_training_steps=total_training_steps,
        warmup_steps=args.warmup_steps,
        cosine_decay_strength=args.cosine_decay_strength,
        scheduler=args.scheduler,
        cosine_flat_period=args.cosine_flat_period,
    )
    _dbg(f"scheduler built: {args.scheduler}")

    history: list[dict[str, float]] = []
    start_epoch = 1

    if args.resume_from is not None:
        _dbg(f"resume_from={args.resume_from} -> load_checkpoint() starting...")
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
        _dbg(f"resume done, start_epoch={start_epoch}")

        if start_epoch > args.epochs:
            raise ValueError(
                f"Checkpoint epoch {resumed_epoch} is already at or beyond requested --epochs={args.epochs}."
            )

    _dbg(
        f"entering training loop: start_epoch={start_epoch}, "
        f"end_epoch={args.epochs}"
    )
    try:
        for epoch in range(start_epoch, args.epochs + 1):
            _dbg(f"=== epoch {epoch}/{args.epochs}: train phase starting ===")
            epoch_train_start = time.time()
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
                class_weights=class_weights,
                max_grad_norm=args.max_grad_norm,
            )
            _dbg(
                f"=== epoch {epoch}/{args.epochs}: train phase done in "
                f"{time.time() - epoch_train_start:.1f}s ==="
            )

            _dbg(f"=== epoch {epoch}/{args.epochs}: val phase starting ===")
            epoch_val_start = time.time()
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
                class_weights=class_weights,
            )
            _dbg(
                f"=== epoch {epoch}/{args.epochs}: val phase done in "
                f"{time.time() - epoch_val_start:.1f}s ==="
            )

            epoch_metrics = {
                "epoch": epoch,
                **{f"train_{key}": value for key, value in train_metrics.items()},
                **{f"val_{key}": value for key, value in val_metrics.items()},
            }
            history.append(epoch_metrics)

            if wandb is not None:
                _dbg(f"wandb.log(epoch_metrics) for epoch {epoch} starting...")
                wandb.log(epoch_metrics)
                _dbg(f"wandb.log(epoch_metrics) for epoch {epoch} done")

                val_accuracy_table = wandb.Table(
                    data=[[entry["epoch"], entry["val_accuracy"]] for entry in history],
                    columns=["epoch", "val_accuracy"],
                )
                _dbg(f"wandb.log(val_accuracy_chart) for epoch {epoch} starting...")
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
                _dbg(f"wandb.log(val_accuracy_chart) for epoch {epoch} done")

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
                )
            else:
                print(f"  [OK]   val_fpr={val_metrics['fpr']:.4f} satisfies FPR constraint ({FPR_CONSTRAINT:.2f})")

            if args.checkpoint_every and epoch % args.checkpoint_every == 0:
                _dbg(f"save_checkpoint() for epoch {epoch} starting...")
                checkpoint_path = save_checkpoint(model, optimizer, scheduler, scaler, args.checkpoint_dir, epoch, history)
                _dbg(f"save_checkpoint() for epoch {epoch} done: {checkpoint_path}")
                print(f"Saved checkpoint: {checkpoint_path}")

        _dbg("training loop done, save_artifacts() starting...")
        save_artifacts(model, args.output_dir, history)
        _dbg(f"save_artifacts() done -> {args.output_dir}")

        # Generate the final confusion matrix once, using the just-saved final
        # model on the validation set. Kept inside the try block so wandb
        # cleanup still runs even if rendering fails.
        _dbg("final confusion matrix inference starting...")
        model.eval()
        final_logits: list[np.ndarray] = []
        final_labels: list[np.ndarray] = []
        total_final_examples = 0
        final_batch_index = 0
        with torch.no_grad():
            for batch in val_loader:
                if args.max_val_batches is not None and final_batch_index >= args.max_val_batches:
                    break
                final_batch_index += 1
                pixel_values = batch["pixel_values"].to(device)
                batch_labels = batch["labels"].to(device)
                with torch.cuda.amp.autocast(enabled=use_mixed_precision):
                    outputs = model(pixel_values=pixel_values)
                final_logits.append(outputs.logits.detach().cpu().numpy())
                final_labels.append(batch_labels.detach().cpu().numpy())
                total_final_examples += batch_labels.size(0)
                if final_batch_index % 10 == 0:
                    _dbg(
                        f"  confusion-matrix inference: batch {final_batch_index}, "
                        f"total_examples={total_final_examples}"
                    )
        _dbg(
            f"final confusion matrix inference done: "
            f"{final_batch_index} batches, {total_final_examples} examples"
        )

        if total_final_examples == 0:
            print("[WARN] No validation examples processed; skipping confusion matrix generation.")
        else:
            _dbg("save_confusion_matrix() starting...")
            confusion_matrix_path = save_confusion_matrix(
                final_logits, final_labels, args.output_dir
            )
            _dbg(f"save_confusion_matrix() done: {confusion_matrix_path}")
            print(f"Saved confusion matrix: {confusion_matrix_path}")
    except Exception as exc:
        _dbg(f"!! unhandled exception in training pipeline: {type(exc).__name__}: {exc}")
        _dbg(traceback.format_exc())
        raise
    finally:
        _dbg("main() finally block: finishing wandb run")
        if wandb_run is not None:
            wandb_run.finish()
        _dbg("main() exiting")
