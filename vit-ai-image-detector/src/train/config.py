from __future__ import annotations

from dataset import LABEL_TO_ID


MODEL_NAME = "google/vit-large-patch16-384"
ID_TO_LABEL = {value: key.capitalize() for key, value in LABEL_TO_ID.items()}