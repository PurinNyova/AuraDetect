from __future__ import annotations

import torch
from torch.optim import AdamW

from .artifacts import save_artifacts
from .cli import parse_args
from .data import build_dataloaders
from .engine import run_phase
from .model import build_model


def main() -> None:
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    train_loader, val_loader = build_dataloaders(args)
    model = build_model(device)
    optimizer = AdamW(filter(lambda parameter: parameter.requires_grad, model.parameters()), lr=args.learning_rate)

    history: list[dict[str, float]] = []

    for epoch in range(1, args.epochs + 1):
        train_metrics = run_phase(
            model,
            train_loader,
            optimizer,
            device,
            train=True,
            phase_name=f"train {epoch}/{args.epochs}",
            max_batches=args.max_train_batches,
        )

        val_metrics = run_phase(
            model,
            val_loader,
            optimizer,
            device,
            train=False,
            phase_name=f"val {epoch}/{args.epochs}",
            max_batches=args.max_val_batches,
        )

        epoch_metrics = {
            "epoch": epoch,
            **{f"train_{key}": value for key, value in train_metrics.items()},
            **{f"val_{key}": value for key, value in val_metrics.items()},
        }
        history.append(epoch_metrics)

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

    save_artifacts(model, args.output_dir, history)