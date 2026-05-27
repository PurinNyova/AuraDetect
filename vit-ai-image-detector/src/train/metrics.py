from __future__ import annotations

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score


def compute_epoch_metrics(logits: list[np.ndarray], labels: list[np.ndarray]) -> dict[str, float]:
    logits_array = np.concatenate(logits, axis=0)
    labels_array = np.concatenate(labels, axis=0)

    probabilities = torch.softmax(torch.from_numpy(logits_array), dim=-1).numpy()
    predictions = probabilities.argmax(axis=1)

    metrics = {
        "accuracy": accuracy_score(labels_array, predictions),
        "f1": f1_score(labels_array, predictions, zero_division=0),
    }

    try:
        metrics["auc"] = roc_auc_score(labels_array, probabilities[:, 1])
    except ValueError:
        metrics["auc"] = float("nan")
    return metrics