from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import albumentations as A
import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset
from transformers import ViTImageProcessor


LABEL_TO_ID = {"real": 0, "ai": 1}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


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


def discover_samples(data_dir: Path) -> list[ImageSample]:
    image_root = data_dir
    if not image_root.exists():
        raise FileNotFoundError(f"Expected dataset at {image_root}. Run 'python src/data_fetch.py' first.")

    samples: list[ImageSample] = []
    for label_name, label_id in LABEL_TO_ID.items():
        label_dir = image_root / label_name
        if not label_dir.exists():
            continue
        for path in sorted(label_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                samples.append(ImageSample(path=path, label=label_id))

    if not samples:
        raise RuntimeError(
            f"No images found under {image_root}. Add files to 'real/' and 'ai/' and rerun training."
        )
    return samples


class AiImageDataset(Dataset):
    def __init__(
        self,
        data_dir: str | Path = "data/dataset",
        split: str = "train",
        val_ratio: float = 0.1,
        random_state: int = 42,
        model_name: str = "google/vit-large-patch16-384",
    ) -> None:
        self.data_dir = Path(data_dir)
        self.split = split
        self.processor = ViTImageProcessor.from_pretrained(model_name)
        image_size = self.processor.size["height"] if isinstance(self.processor.size, dict) else 384

        all_samples = discover_samples(self.data_dir)
        indices = np.arange(len(all_samples))
        labels = np.array([sample.label for sample in all_samples])

        train_indices, val_indices = train_test_split(
            indices,
            test_size=val_ratio,
            random_state=random_state,
            stratify=labels,
        )

        selected_indices = train_indices if split == "train" else val_indices
        self.samples = [all_samples[index] for index in selected_indices]
        self.transform = (
            build_augmentation_pipeline(image_size) if split == "train" else build_eval_pipeline(image_size)
        )

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, Any]:
        sample = self.samples[index]
        image = Image.open(sample.path).convert("RGB")
        image_array = np.array(image)
        transformed = self.transform(image=image_array)
        processed = self.processor(images=transformed["image"], return_tensors="pt")

        return {
            "pixel_values": processed["pixel_values"].squeeze(0),
            "labels": sample.label,
            "path": str(sample.path),
        }
