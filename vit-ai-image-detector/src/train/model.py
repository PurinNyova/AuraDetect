from __future__ import annotations

import torch
from transformers import AutoModelForImageClassification

from .config import ID_TO_LABEL, MODEL_NAME
from dataset import LABEL_TO_ID


def build_model(device: torch.device) -> AutoModelForImageClassification:
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME,
        num_labels=2,
        id2label=ID_TO_LABEL,
        label2id=LABEL_TO_ID,
        ignore_mismatched_sizes=True,
    )

    for parameter in model.parameters():
        parameter.requires_grad = False

    for parameter in model.classifier.parameters():
        parameter.requires_grad = True

    model.to(device)
    return model