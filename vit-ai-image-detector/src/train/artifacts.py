from __future__ import annotations

import json
from pathlib import Path


from transformers import AutoModelForImageClassification
import torch
from torch.cuda.amp import GradScaler
from torch.optim import Optimizer
from torch.optim.lr_scheduler import LRScheduler


def save_artifacts(model: AutoModelForImageClassification, output_dir: Path, history: list[dict[str, float]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output_dir)

    history_path = output_dir / "history.json"
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")


def save_checkpoint(
    model: AutoModelForImageClassification,
    optimizer: Optimizer,
    scheduler: LRScheduler | None,
    scaler: GradScaler | None,
    checkpoint_dir: Path,
    epoch: int,
    history: list[dict[str, float]],
) -> Path:
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "scheduler_state_dict": None if scheduler is None else scheduler.state_dict(),
        "scaler_state_dict": None if scaler is None else scaler.state_dict(),
        "history": history,
    }

    epoch_path = checkpoint_dir / f"epoch-{epoch:03d}.pt"
    torch.save(checkpoint, epoch_path)
    torch.save(checkpoint, checkpoint_dir / "latest.pt")
    return epoch_path


def load_checkpoint(
    checkpoint_path: Path,
    model: AutoModelForImageClassification,
    optimizer: Optimizer,
    scheduler: LRScheduler | None,
    device: torch.device,
    scaler: GradScaler | None = None,
) -> tuple[int, list[dict[str, float]], bool]:
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    optimizer.load_state_dict(checkpoint["optimizer_state_dict"])

    scaler_state_dict = checkpoint.get("scaler_state_dict")
    if scaler is not None and scaler_state_dict is not None:
        scaler.load_state_dict(scaler_state_dict)

    scheduler_state_dict = checkpoint.get("scheduler_state_dict")
    if scheduler is not None and scheduler_state_dict is not None:
        scheduler.load_state_dict(scheduler_state_dict)
        return int(checkpoint["epoch"]), list(checkpoint.get("history", [])), True

    return int(checkpoint["epoch"]), list(checkpoint.get("history", [])), False
