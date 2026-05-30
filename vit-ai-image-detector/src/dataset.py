from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import albumentations as A
import numpy as np
from PIL import Image, UnidentifiedImageError
import torch
from torch.utils.data import Dataset
from transformers import ViTImageProcessor


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
        self.processor = ViTImageProcessor.from_pretrained(model_name)
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
