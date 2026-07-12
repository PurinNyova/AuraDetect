from __future__ import annotations

import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


# Label convention from src/dataset.py: {"real": 0, "ai": 1}. The positive
# class is therefore label 1 (AI-generated). All binary metrics are reported
# with pos_label=1 to keep that convention consistent across the pipeline.
POSITIVE_LABEL = 1
NEGATIVE_LABEL = 0


def compute_epoch_metrics(logits: list[np.ndarray], labels: list[np.ndarray]) -> dict[str, float]:
    logits_array = np.concatenate(logits, axis=0)
    labels_array = np.concatenate(labels, axis=0)

    probabilities = torch.softmax(torch.from_numpy(logits_array), dim=-1).numpy()
    predictions = probabilities.argmax(axis=1)

    # confusion_matrix with explicit labels fixes row/column order regardless
    # of which classes are present in this batch. cm[i, j] counts samples with
    # true label i that were predicted as label j.
    confusion = confusion_matrix(labels_array, predictions, labels=[NEGATIVE_LABEL, POSITIVE_LABEL])
    tn, fp, fn, tp = (int(cell) for cell in confusion.ravel())

    positive_denominator = tp + fn
    negative_denominator = fp + tn
    # When a class is absent from y_true the denominator collapses. FPR=0/0 is
    # reported as 0.0 (vacuously satisfied) so the constraint check stays
    # well-defined; an empty negative slice cannot violate FPR < 15%.
    fpr = float(fp) / float(negative_denominator) if negative_denominator > 0 else 0.0
    tpr = float(tp) / float(positive_denominator) if positive_denominator > 0 else 0.0

    metrics: dict[str, float] = {
        "accuracy": accuracy_score(labels_array, predictions),
        "precision": precision_score(labels_array, predictions, pos_label=POSITIVE_LABEL, zero_division=0),
        "recall": recall_score(labels_array, predictions, pos_label=POSITIVE_LABEL, zero_division=0),
        "f1": f1_score(labels_array, predictions, pos_label=POSITIVE_LABEL, zero_division=0),
        "fpr": fpr,
        "tpr": tpr,
        "tn": float(tn),
        "fp": float(fp),
        "fn": float(fn),
        "tp": float(tp),
    }

    try:
        metrics["auc"] = roc_auc_score(labels_array, probabilities[:, POSITIVE_LABEL])
    except ValueError:
        # AUC is undefined when only one class is present in y_true.
        metrics["auc"] = float("nan")
    return metrics
