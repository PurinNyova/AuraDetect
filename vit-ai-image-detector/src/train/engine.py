from __future__ import annotations

from collections.abc import Callable

import numpy as np
import torch
import torch.nn.functional as F
from torch.cuda.amp import GradScaler
from torch.optim import AdamW
from torch.optim.lr_scheduler import LRScheduler
from torch.utils.data import DataLoader
from tqdm.auto import tqdm
from transformers import AutoModelForImageClassification

from .metrics import compute_epoch_metrics


def compute_classification_loss(
    logits: torch.Tensor,
    labels: torch.Tensor,
    class_weights: torch.Tensor | None,
) -> torch.Tensor:
    """Weighted CE over {real=0, ai=1}. Higher real weight penalizes false AI more."""
    return F.cross_entropy(logits, labels, weight=class_weights)


def run_phase(
    model: AutoModelForImageClassification,
    loader: DataLoader,
    optimizer: AdamW,
    scheduler: LRScheduler | None,
    device: torch.device,
    train: bool,
    phase_name: str,
    mixed_precision: bool = False,
    scaler: GradScaler | None = None,
    max_batches: int | None = None,
    step_log_fn: Callable[[dict[str, float | int]], None] | None = None,
    class_weights: torch.Tensor | None = None,
    max_grad_norm: float | None = None,
) -> dict[str, float]:
    model.train(mode=train)

    total_loss = 0.0
    total_examples = 0
    all_logits: list[np.ndarray] = []
    all_labels: list[np.ndarray] = []
    clip_gradients = max_grad_norm is not None and max_grad_norm > 0.0

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
            with torch.cuda.amp.autocast(enabled=mixed_precision):
                # Forward without labels so loss uses our class weights, not HF defaults.
                outputs = model(pixel_values=pixel_values)
                loss = compute_classification_loss(outputs.logits, labels, class_weights)

            if train:
                current_learning_rate = float(optimizer.param_groups[0]["lr"])
                optimizer.zero_grad(set_to_none=True)
                if mixed_precision and scaler is not None:
                    scaler.scale(loss).backward()
                    if clip_gradients:
                        # Unscale before clipping so max_grad_norm applies in true fp32 space.
                        scaler.unscale_(optimizer)
                        torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    loss.backward()
                    if clip_gradients:
                        torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
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
