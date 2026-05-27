from __future__ import annotations

import argparse

import torch
from torch.utils.data import DataLoader

from dataset import AiImageDataset
from .config import MODEL_NAME


def collate_fn(batch: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
    pixel_values = torch.stack([item["pixel_values"] for item in batch])
    labels = torch.tensor([item["labels"] for item in batch], dtype=torch.long)
    return {"pixel_values": pixel_values, "labels": labels}


def build_dataloaders(args: argparse.Namespace) -> tuple[DataLoader, DataLoader]:
    train_dataset = AiImageDataset(
        data_dir=args.data_dir,
        split="train",
        model_name=MODEL_NAME,
        cache_processed=False,
    )
    val_dataset = AiImageDataset(
        data_dir=args.data_dir,
        split="val",
        model_name=MODEL_NAME,
        cache_processed=args.cache_val_preprocessing,
    )

    use_persistent_workers = args.num_workers > 0

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        persistent_workers=use_persistent_workers,
        pin_memory=torch.cuda.is_available(),
        collate_fn=collate_fn,
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        persistent_workers=use_persistent_workers,
        pin_memory=torch.cuda.is_available(),
        collate_fn=collate_fn,
    )
    return train_loader, val_loader