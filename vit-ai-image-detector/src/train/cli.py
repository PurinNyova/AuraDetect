from __future__ import annotations

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune ViT on AI vs real images.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/dataset"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/models"))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=2)
    parser.add_argument("--max-train-batches", type=int, default=None)
    parser.add_argument("--max-val-batches", type=int, default=None)
    parser.add_argument(
        "--cache-val-preprocessing",
        action="store_true",
        default=True,
        help="Cache preprocessed validation samples in memory to speed up later epochs.",
    )
    parser.add_argument(
        "--no-cache-val-preprocessing",
        action="store_false",
        dest="cache_val_preprocessing",
        help="Disable validation preprocessing cache if memory usage is too high.",
    )
    return parser.parse_args()