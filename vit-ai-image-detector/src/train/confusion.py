from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import confusion_matrix

from dataset import LABEL_TO_ID
from .metrics import NEGATIVE_LABEL, POSITIVE_LABEL


def save_confusion_matrix(
    logits: list[np.ndarray],
    labels: list[np.ndarray],
    output_dir: Path,
    filename: str = "confusion_matrix.png",
    ai_verdict_threshold: float | None = None,
) -> Path:
    """Render the final 2x2 confusion matrix as a PNG heatmap and save to output_dir.

    Called once after the training loop completes (see pipeline.main) so the
    figure reflects the just-saved final checkpoint. Layout follows metrics.py:
    rows are true labels, columns are predicted labels, ordered [real=0, ai=1].

    When ``ai_verdict_threshold`` is set, predictions mirror infer_api's
    verdict rule: a sample is "ai" only when P(ai) >= threshold, otherwise
    it falls back to "real". This lets the figure reflect what the deployed
    API would output rather than the raw argmax. When None (default), argmax
    is used (preserves the original training-time semantics).
    """
    logits_array = np.concatenate(logits, axis=0)
    labels_array = np.concatenate(labels, axis=0)

    probabilities = torch.softmax(torch.from_numpy(logits_array), dim=-1).numpy()
    ai_probabilities = probabilities[:, POSITIVE_LABEL]

    if ai_verdict_threshold is None:
        predictions = probabilities.argmax(axis=1)
        title_suffix = "argmax"
    else:
        predictions = (ai_probabilities >= ai_verdict_threshold).astype(np.int64)
        title_suffix = f"verdict threshold >= {ai_verdict_threshold:.2f}"

    cm = confusion_matrix(labels_array, predictions, labels=[NEGATIVE_LABEL, POSITIVE_LABEL])

    id_to_label = {label_id: label_name for label_name, label_id in LABEL_TO_ID.items()}
    display_labels = [id_to_label[NEGATIVE_LABEL], id_to_label[POSITIVE_LABEL]]

    figure, axis = plt.subplots(figsize=(6, 5))
    image = axis.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    figure.colorbar(image, ax=axis)

    axis.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=display_labels,
        yticklabels=display_labels,
        ylabel="True label",
        xlabel="Predicted label",
        title=f"Confusion Matrix (Validation, {title_suffix})",
    )

    row_sums = cm.sum(axis=1, keepdims=True)
    normalized = np.divide(
        cm.astype(float),
        row_sums,
        out=np.zeros_like(cm, dtype=float),
        where=row_sums != 0,
    )

    threshold = cm.max() / 2.0 if cm.max() > 0 else 0.5
    for row_index in range(cm.shape[0]):
        for col_index in range(cm.shape[1]):
            count = int(cm[row_index, col_index])
            percent = normalized[row_index, col_index] * 100.0
            axis.text(
                col_index,
                row_index,
                f"{count}\n({percent:.1f}%)",
                ha="center",
                va="center",
                color="white" if cm[row_index, col_index] > threshold else "black",
            )

    figure.tight_layout()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    figure.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(figure)
    return output_path
