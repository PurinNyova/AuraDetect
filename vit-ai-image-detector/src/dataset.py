from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import albumentations as A
import numpy as np
from PIL import Image, UnidentifiedImageError
import torch
from torch.utils.data import Dataset
from transformers import ViTImageProcessor

# Ensure TLS verification works on Windows/managed Pythons where the default
# CA bundle is missing (e.g. conda base without certifi on PATH). This must
# run before huggingface_hub's first request.
try:
    import certifi  # type: ignore

    _ca = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", _ca)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _ca)
    os.environ.setdefault("CURL_CA_BUNDLE", _ca)
except Exception:  # pragma: no cover - certifi not installed
    pass


LABEL_TO_ID = {"real": 0, "ai": 1}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


@dataclass(frozen=True)
class ImageSample:
    path: Path
    label: int


def build_augmentation_pipeline(image_size: int = 384) -> A.Compose:
    return A.Compose(
        [
            A.SmallestMaxSize(max_size=image_size + 32),
            A.RandomCrop(height=image_size, width=image_size),
            A.HorizontalFlip(p=0.5),
            A.ColorJitter(p=0.5),
            A.GaussianBlur(blur_limit=(3, 5), p=0.2),
            A.ImageCompression(quality_range=(70, 100), p=0.2),
        ]
    )


def build_eval_pipeline(image_size: int = 384) -> A.Compose:
    return A.Compose(
        [
            A.LongestMaxSize(max_size=image_size),
            A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=0),
            A.CenterCrop(height=image_size, width=image_size),
        ]
    )


def get_split_root(data_dir: Path, split: str) -> Path:
    split_root = data_dir / split
    if split_root.exists():
        return split_root

    if split in {"train", "val"}:
        return data_dir

    raise FileNotFoundError(f"Expected split directory at {split_root}.")


def is_readable_image(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (UnidentifiedImageError, OSError, ValueError):
        return False


def discover_samples(data_dir: Path, split: str) -> list[ImageSample]:
    image_root = get_split_root(data_dir, split)
    if not image_root.exists():
        raise FileNotFoundError(f"Expected dataset at {image_root}. Run 'python src/data_fetch.py' first.")

    samples: list[ImageSample] = []
    skipped_corrupt_files = 0
    for label_name, label_id in LABEL_TO_ID.items():
        label_dir = image_root / label_name
        if not label_dir.exists():
            continue
        for path in sorted(label_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                if is_readable_image(path):
                    samples.append(ImageSample(path=path, label=label_id))
                else:
                    skipped_corrupt_files += 1

    if skipped_corrupt_files > 0:
        print(f"[{split}] Skipped {skipped_corrupt_files} unreadable image file(s).")

    if not samples:
        raise RuntimeError(
            f"No images found under {image_root}. Add files to '{split}/real' and '{split}/ai' and rerun training."
        )
    return samples


def _find_local_snapshot(model_name: str) -> str | None:
    """Return the local HF cache directory for `model_name` if it exists.

    Tries the modern `HF_HUB_CACHE` / `HF_HOME` layout first, then falls back
    to the legacy `TRANSFORMERS_CACHE` and `~/.cache/huggingface` paths so we
    can load the processor fully offline once the model has been downloaded.
    """
    if os.path.isabs(model_name) and Path(model_name).is_dir():
        return model_name

    repo_dir = "models--" + model_name.replace("/", "--")

    candidates: list[Path] = []
    for env in ("HF_HUB_CACHE", "HF_HOME", "TRANSFORMERS_CACHE"):
        root = os.environ.get(env)
        if not root:
            continue
        base = Path(root)
        if env == "HF_HOME":
            base = base / "hub"
        candidates.append(base / repo_dir)

    candidates.append(Path.home() / ".cache" / "huggingface" / "hub" / repo_dir)
    candidates.append(Path.home() / ".cache" / "huggingface" / repo_dir)

    for candidate in candidates:
        if not candidate.is_dir():
            continue
        snapshots = candidate / "snapshots"
        if not snapshots.is_dir():
            continue
        for snap in snapshots.iterdir():
            if (snap / "preprocessor_config.json").is_file():
                return str(snap)
    return None


def _load_processor(model_name: str):
    """Load a ViTImageProcessor, preferring a local snapshot to avoid the network."""
    local = _find_local_snapshot(model_name)
    if local is not None:
        return ViTImageProcessor.from_pretrained(local)

    # No local copy. Try the network; the SSL env vars set at import time
    # should let the request succeed on managed Python installs.
    try:
        return ViTImageProcessor.from_pretrained(model_name)
    except (OSError, RuntimeError) as exc:
        raise RuntimeError(
            f"Could not load image processor for '{model_name}'. "
            f"Pre-download it once with `huggingface-cli download {model_name}` "
            f"or set HF_HOME to a directory that already contains it. "
            f"Underlying error: {exc}"
        ) from exc


class AiImageDataset(Dataset):
    def __init__(
        self,
        data_dir: str | Path = "data/dataset",
        split: str = "train",
        model_name: str = "google/vit-large-patch16-384",
        cache_processed: bool = False,
    ) -> None:
        self.data_dir = Path(data_dir)
        self.split = split
        self.cache_processed = cache_processed
        self.processor = _load_processor(model_name)
        image_size = self.processor.size["height"] if isinstance(self.processor.size, dict) else 384

        self.samples = discover_samples(self.data_dir, split)
        self.transform = (
            build_augmentation_pipeline(image_size) if split == "train" else build_eval_pipeline(image_size)
        )
        self._cache: dict[int, dict[str, Any]] = {}
        self._warned_bad_paths: set[Path] = set()

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, Any]:
        if self.cache_processed and index in self._cache:
            return self._cache[index]

        max_attempts = len(self.samples)
        current_index = index

        for _ in range(max_attempts):
            sample = self.samples[current_index]
            try:
                with Image.open(sample.path) as image:
                    image_array = np.array(image.convert("RGB"))
            except (UnidentifiedImageError, OSError, ValueError):
                if sample.path not in self._warned_bad_paths:
                    self._warned_bad_paths.add(sample.path)
                    print(f"[{self.split}] Skipping unreadable image: {sample.path}")
                current_index = (current_index + 1) % max_attempts
                continue

            transformed = self.transform(image=image_array)
            processed = self.processor(images=transformed["image"], return_tensors="pt")

            item = {
                "pixel_values": processed["pixel_values"].squeeze(0),
                "labels": sample.label,
                "path": str(sample.path),
            }

            if self.cache_processed:
                # Validation/eval transforms are deterministic, so this avoids repeated CPU preprocessing.
                self._cache[index] = {
                    "pixel_values": item["pixel_values"].detach().clone(),
                    "labels": item["labels"],
                    "path": item["path"],
                }

            return item

        raise RuntimeError(
            f"All images reachable from index {index} in split '{self.split}' failed to load. "
            "Check dataset integrity."
        )
