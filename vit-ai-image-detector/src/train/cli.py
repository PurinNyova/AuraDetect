from __future__ import annotations

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune ViT on AI vs real images.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/dataset"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/models"))
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=None,
        help="Directory for training checkpoints. Defaults to <output-dir>/checkpoints.",
    )
    parser.add_argument(
        "--resume-from",
        type=Path,
        default=None,
        help="Resume training from a checkpoint file created by this script.",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=1,
        help="Save a checkpoint every N epochs. Use 0 to disable periodic checkpoints.",
    )
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument(
        "--real-class-weight",
        type=float,
        default=1.0,
        help="Cross-entropy weight for the real class (label 0). >1.0 penalizes false AI more.",
    )
    parser.add_argument(
        "--ai-class-weight",
        type=float,
        default=1.0,
        help="Cross-entropy weight for the AI class (label 1).",
    )
    parser.add_argument(
        "--mixed-precision",
        action="store_true",
        help="Enable CUDA automatic mixed precision (AMP). Defaults to full precision (fp32).",
    )
    parser.add_argument(
        "--warmup-steps",
        type=int,
        default=0,
        help="Number of optimizer steps used to linearly warm up the learning rate.",
    )
    parser.add_argument(
        "--scheduler",
        type=str,
        default="cosine",
        help="Learning rate scheduler to use.",
    )
    parser.add_argument(
        "--cosine-decay-strength",
        type=float,
        default=1.0,
        help="(cosine) How much of the base learning rate to decay over cosine schedule. 1.0 decays to 0, 0.5 decays to 50%% of base LR.",
    )
    parser.add_argument(
        "--cosine-flat-period",
        type=float,
        default=0.0,
        help="(cosine) Percentage of post-warmup training steps to hold LR flat at base value before decay starts. 0 = no flat period; 10 = flat for 10%% of post-warmup steps then decay over the rest.",
    )
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
    parser.add_argument(
        "--wandb",
        action="store_true",
        help="Enable Weights & Biases experiment tracking.",
    )
    parser.add_argument(
        "--wandb-project",
        type=str,
        default="aura-vit",
        help="Weights & Biases project name.",
    )
    parser.add_argument(
        "--wandb-entity",
        type=str,
        default=None,
        help="Optional Weights & Biases entity (team or username).",
    )
    parser.add_argument(
        "--wandb-run-name",
        type=str,
        default=None,
        help="Optional Weights & Biases run name.",
    )
    parser.add_argument(
        "--wandb-mode",
        type=str,
        choices=("online", "offline", "disabled"),
        default="online",
        help="Weights & Biases mode.",
    )
    args = parser.parse_args()

    if args.checkpoint_every < 0:
        parser.error("--checkpoint-every must be 0 or greater.")

    if args.real_class_weight <= 0.0:
        parser.error("--real-class-weight must be > 0.")

    if args.ai_class_weight <= 0.0:
        parser.error("--ai-class-weight must be > 0.")

    if args.warmup_steps < 0:
        parser.error("--warmup-steps must be 0 or greater.")

    if args.scheduler is None:
        parser.error("--scheduler must be provided.")

    args.scheduler = str(args.scheduler).strip().lower()
    if args.scheduler not in {"cosine", "constant"}:
        parser.error("--scheduler must be one of: cosine, constant.")

    if args.scheduler == "cosine" and not 0.0 <= args.cosine_decay_strength <= 1.0:
        parser.error("--cosine-decay-strength must be between 0.0 and 1.0.")

    if args.scheduler == "cosine" and not 0.0 <= args.cosine_flat_period <= 100.0:
        parser.error("--cosine-flat-period must be between 0.0 and 100.0.")

    if args.checkpoint_dir is None:
        args.checkpoint_dir = args.output_dir / "checkpoints"

    return args
