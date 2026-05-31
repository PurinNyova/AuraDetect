from __future__ import annotations

from collections.abc import Callable

import numpy as np
import torch
from torch.optim import AdamW
from torch.optim.lr_scheduler import LRScheduler
from torch.utils.data import DataLoader
from tqdm.auto import tqdm
from transformers import AutoModelForImageClassification

from .metrics import compute_epoch_metrics


def run_phase(
    model: AutoModelForImageClassification,
    loader: DataLoader,
    optimizer: AdamW,
    scheduler: LRScheduler | None,
    device: torch.device,
    train: bool,
    phase_name: str,
    max_batches: int | None = None,
    step_log_fn: Callable[[dict[str, float | int]], None] | None = None,
) -> dict[str, float]:
    model.train(mode=train)

    total_loss = 0.0
    total_examples = 0
    all_logits: list[np.ndarray] = []
    all_labels: list[np.ndarray] = []

    total_batches = len(loader)
    if max_batches is not None:
        total_batches = min(total_batches, max_batches)

    progress = tqdm(loader, total=total_batches, desc=phase_name, leave=False)
    for batch_index, batch in enumerate(progress):
        if max_batches is not None and batch_index >= max_batches:
            break

        pixel_values = batch["pixel_values"].to(device)
        labels = batch["labels"].to(device)

        with torch.set_grad_enabled(train):
            outputs = model(pixel_values=pixel_values, labels=labels)
            loss = outputs.loss

            if train:
                current_learning_rate = float(optimizer.param_groups[0]["lr"])
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
                if scheduler is not None:
                    scheduler.step()

        total_loss += loss.item() * labels.size(0)
        total_examples += labels.size(0)
        progress.set_postfix(loss=f"{loss.item():.4f}")
        all_logits.append(outputs.logits.detach().cpu().numpy())
        all_labels.append(labels.detach().cpu().numpy())

        if step_log_fn is not None:
            step_payload: dict[str, float | int] = {
                "batch": batch_index + 1,
                "batch_size": int(labels.size(0)),
                "batch_loss": float(loss.item()),
            }
            if train:
                step_payload["learning_rate"] = current_learning_rate
            step_log_fn(step_payload)

    if total_examples == 0:
        raise RuntimeError("No batches were processed. Increase --max-train-batches/--max-val-batches or check the dataset.")

    metrics = compute_epoch_metrics(all_logits, all_labels)
    metrics["loss"] = total_loss / total_examples
    return metrics