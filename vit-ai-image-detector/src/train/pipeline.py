from __future__ import annotations

import argparse

from .artifacts import load_checkpoint, save_artifacts, save_checkpoint

import torch
from torch.optim import AdamW

from .cli import parse_args
from .data import build_dataloaders
from .engine import run_phase
from .model import build_model


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
            "num_workers": args.num_workers,
            "cache_val_preprocessing": args.cache_val_preprocessing,
            "data_dir": str(args.data_dir),
            "output_dir": str(args.output_dir),
            "checkpoint_dir": str(args.checkpoint_dir),
            "checkpoint_every": args.checkpoint_every,
            "resume_from": None if args.resume_from is None else str(args.resume_from),
        },
    )
    return wandb, run


def main() -> None:
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

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
                },
                step=global_step,
            )

        return log_step

    train_loader, val_loader = build_dataloaders(args)
    model = build_model(device)
    optimizer = AdamW(filter(lambda parameter: parameter.requires_grad, model.parameters()), lr=args.learning_rate)

    history: list[dict[str, float]] = []
    start_epoch = 1

    if args.resume_from is not None:
        resumed_epoch, history = load_checkpoint(args.resume_from, model, optimizer, device)
        start_epoch = resumed_epoch + 1
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
                device,
                train=True,
                phase_name=f"train {epoch}/{args.epochs}",
                max_batches=args.max_train_batches,
                step_log_fn=make_step_logger("train", epoch),
            )

            val_metrics = run_phase(
                model,
                val_loader,
                optimizer,
                device,
                train=False,
                phase_name=f"val {epoch}/{args.epochs}",
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
                wandb.log(epoch_metrics, step=epoch)

            print(
                " | ".join(
                    [
                        f"epoch={epoch}",
                        f"train_loss={train_metrics['loss']:.4f}",
                        f"train_acc={train_metrics['accuracy']:.4f}",
                        f"train_f1={train_metrics['f1']:.4f}",
                        f"train_auc={train_metrics['auc']:.4f}",
                        f"val_loss={val_metrics['loss']:.4f}",
                        f"val_acc={val_metrics['accuracy']:.4f}",
                        f"val_f1={val_metrics['f1']:.4f}",
                        f"val_auc={val_metrics['auc']:.4f}",
                    ]
                )
            )

            if args.checkpoint_every and epoch % args.checkpoint_every == 0:
                checkpoint_path = save_checkpoint(model, optimizer, args.checkpoint_dir, epoch, history)
                print(f"Saved checkpoint: {checkpoint_path}")

        save_artifacts(model, args.output_dir, history)
    finally:
        if wandb_run is not None:
            wandb_run.finish()