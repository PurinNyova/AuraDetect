from __future__ import annotations

import os

import torch
from transformers import AutoModelForImageClassification

# Reuse the SSL bootstrap from dataset so the very first HF request can
# verify the cert chain on managed Python installs (Windows/conda base).
try:
    import certifi  # type: ignore

    _ca = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", _ca)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _ca)
    os.environ.setdefault("CURL_CA_BUNDLE", _ca)
except Exception:  # pragma: no cover
    pass

from .config import ID_TO_LABEL, MODEL_NAME
from dataset import LABEL_TO_ID, _find_local_snapshot


def build_model(device: torch.device) -> AutoModelForImageClassification:
    local = _find_local_snapshot(MODEL_NAME) or MODEL_NAME
    model = AutoModelForImageClassification.from_pretrained(
        local,
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