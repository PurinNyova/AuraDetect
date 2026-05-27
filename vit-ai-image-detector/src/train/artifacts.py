from __future__ import annotations

import json
from pathlib import Path

from transformers import AutoModelForImageClassification


def save_artifacts(model: AutoModelForImageClassification, output_dir: Path, history: list[dict[str, float]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output_dir)

    history_path = output_dir / "history.json"
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")