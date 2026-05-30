from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import zipfile
from pathlib import Path
from typing import Iterable

from data_fetch import build_manifest, ensure_dataset_layout


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
AI_LABEL_ALIASES = ("ai", "fake", "generated")
REAL_LABEL_ALIASES = ("real", "non_ai", "non-ai", "nonai", "human", "authentic")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download the Kaggle 15k AI/non-AI dataset, keep val intact, and build a "
            "balanced train split where train/real matches train/ai."
        )
    )
    parser.add_argument(
        "--dataset",
        default="factfry/15k-ai-nonai-images",
        help="Kaggle dataset slug.",
    )
    parser.add_argument(
        "--download-dir",
        type=Path,
        default=Path("data/raw/factfry-15k-ai-nonai-images"),
        help="Directory where the Kaggle archive and extracted raw files are stored.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/processed/factfry-15k-balanced"),
        help="Directory where the balanced train/val dataset is written.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used when sampling train/real.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload and rebuild outputs even if files already exist.",
    )
    parser.add_argument(
        "--merge-dataset-dir",
        type=Path,
        default=Path("data/dataset"),
        help="Existing dataset root to merge the Kaggle files into after staging.",
    )
    parser.add_argument(
        "--merge-subdir",
        type=Path,
        default=Path("kaggle") / "factfry-15k",
        help="Nested destination under data/dataset/{ai,real} used for merged Kaggle files.",
    )
    return parser.parse_args()


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def configure_env_from_kaggle_payload(payload: str) -> bool:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return False

    username = data.get("username")
    key = data.get("key")
    if not isinstance(username, str) or not isinstance(key, str):
        return False

    os.environ.setdefault("KAGGLE_USERNAME", username)
    os.environ.setdefault("KAGGLE_KEY", key)
    return True


def configure_env_from_kaggle_file(kaggle_json_path: Path) -> bool:
    try:
        data = json.loads(kaggle_json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    username = data.get("username")
    key = data.get("key")
    if not isinstance(username, str) or not isinstance(key, str):
        return False

    os.environ.setdefault("KAGGLE_USERNAME", username)
    os.environ.setdefault("KAGGLE_KEY", key)
    return True


def ensure_kaggle_auth() -> None:
    load_env_file(Path(".env"))
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return

    kaggle_api_token = os.environ.get("KAGGLE_API_TOKEN")
    if kaggle_api_token and configure_env_from_kaggle_payload(kaggle_api_token):
        return

    for candidate in sorted(Path.cwd().glob("kaggle*.json")):
        if configure_env_from_kaggle_file(candidate):
            return

    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if kaggle_json.exists() and configure_env_from_kaggle_file(kaggle_json):
        return
    raise RuntimeError(
        "Kaggle credentials are missing. Set KAGGLE_USERNAME and KAGGLE_KEY in .env "
        "or place kaggle.json under ~/.kaggle/."
    )


def download_dataset(dataset: str, download_dir: Path, force: bool) -> Path:
    from kaggle.api.kaggle_api_extended import KaggleApi

    download_dir.mkdir(parents=True, exist_ok=True)
    archive_path = download_dir / f"{dataset.split('/', 1)[1]}.zip"

    if force or not archive_path.exists():
        api = KaggleApi()
        api.authenticate()
        api.dataset_download_files(dataset=dataset, path=str(download_dir), unzip=False, force=force, quiet=False)

    return archive_path


def extract_archive(archive_path: Path, extract_dir: Path, force: bool) -> None:
    if extract_dir.exists() and force:
        shutil.rmtree(extract_dir)
    if extract_dir.exists():
        return

    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(extract_dir)


def resolve_dataset_root(extract_dir: Path) -> Path:
    if (extract_dir / "train").exists() and (extract_dir / "val").exists():
        return extract_dir

    candidates = [path for path in extract_dir.iterdir() if path.is_dir()]
    if len(candidates) == 1 and (candidates[0] / "train").exists() and (candidates[0] / "val").exists():
        return candidates[0]

    raise FileNotFoundError(f"Could not find train/ and val/ under {extract_dir}")


def resolve_label_dir(split_dir: Path, aliases: Iterable[str]) -> Path:
    alias_map = {alias.lower().replace("-", "_"): alias for alias in aliases}
    candidates = []
    for child in split_dir.iterdir():
        if not child.is_dir():
            continue
        normalized = child.name.lower().replace("-", "_")
        if normalized in alias_map:
            candidates.append(child)

    if len(candidates) != 1:
        raise FileNotFoundError(
            f"Expected exactly one label directory in {split_dir} matching {tuple(aliases)}, found {len(candidates)}."
        )
    return candidates[0]


def collect_images(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def count_images(root: Path) -> int:
    if not root.exists():
        return 0
    return len(collect_images(root))


def reset_output_dir(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def copy_group(files: list[Path], source_root: Path, dest_root: Path) -> int:
    copied = 0
    for source_path in files:
        relative_path = source_path.relative_to(source_root)
        target_path = dest_root / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        copied += 1
    return copied


def stage_dataset(dataset_root: Path, output_dir: Path, seed: int) -> dict[str, dict[str, int]]:
    train_dir = dataset_root / "train"
    val_dir = dataset_root / "val"

    train_ai_dir = resolve_label_dir(train_dir, AI_LABEL_ALIASES)
    train_real_dir = resolve_label_dir(train_dir, REAL_LABEL_ALIASES)
    val_ai_dir = resolve_label_dir(val_dir, AI_LABEL_ALIASES)
    val_real_dir = resolve_label_dir(val_dir, REAL_LABEL_ALIASES)

    train_ai_files = collect_images(train_ai_dir)
    train_real_files = collect_images(train_real_dir)
    val_ai_files = collect_images(val_ai_dir)
    val_real_files = collect_images(val_real_dir)

    sample_size = min(len(train_ai_files), len(train_real_files))
    sampler = random.Random(seed)
    sampled_train_real_files = sorted(sampler.sample(train_real_files, sample_size))

    reset_output_dir(output_dir)

    copy_group(train_ai_files, train_ai_dir, output_dir / "train" / "ai")
    copy_group(sampled_train_real_files, train_real_dir, output_dir / "train" / "real")
    copy_group(val_ai_files, val_ai_dir, output_dir / "val" / "ai")
    copy_group(val_real_files, val_real_dir, output_dir / "val" / "real")

    summary = {
        "train": {"ai": len(train_ai_files), "real": len(sampled_train_real_files)},
        "val": {"ai": len(val_ai_files), "real": len(val_real_files)},
        "source": {
            "train_ai": len(train_ai_files),
            "train_real": len(train_real_files),
            "val_ai": len(val_ai_files),
            "val_real": len(val_real_files),
        },
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def load_split_files(dataset_root: Path) -> dict[str, list[Path]]:
    train_dir = dataset_root / "train"
    val_dir = dataset_root / "val"

    train_ai_dir = resolve_label_dir(train_dir, AI_LABEL_ALIASES)
    train_real_dir = resolve_label_dir(train_dir, REAL_LABEL_ALIASES)
    val_ai_dir = resolve_label_dir(val_dir, AI_LABEL_ALIASES)
    val_real_dir = resolve_label_dir(val_dir, REAL_LABEL_ALIASES)

    return {
        "train_ai": collect_images(train_ai_dir),
        "train_real": collect_images(train_real_dir),
        "val_ai": collect_images(val_ai_dir),
        "val_real": collect_images(val_real_dir),
        "train_ai_root": train_ai_dir,
        "train_real_root": train_real_dir,
        "val_ai_root": val_ai_dir,
        "val_real_root": val_real_dir,
    }


def write_manifest(dataset_dir: Path) -> Path:
    manifest_path = dataset_dir / "manifest.json"
    manifest = build_manifest(dataset_dir)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def merge_into_dataset(
    dataset_root: Path,
    merge_dataset_dir: Path,
    merge_subdir: Path,
    seed: int,
) -> dict[str, int]:
    split_files = load_split_files(dataset_root)
    ensure_dataset_layout(merge_dataset_dir)

    existing_ai = count_images(merge_dataset_dir / "ai")
    existing_real = count_images(merge_dataset_dir / "real")

    ai_additions = len(split_files["train_ai"]) + len(split_files["val_ai"])
    real_target_additions = max(0, existing_ai + ai_additions - existing_real)
    val_real_count = len(split_files["val_real"])
    remaining_train_real_needed = max(0, real_target_additions - val_real_count)
    train_real_to_copy = min(len(split_files["train_real"]), remaining_train_real_needed)

    sampler = random.Random(seed)
    sampled_train_real = sorted(sampler.sample(split_files["train_real"], train_real_to_copy))

    ai_dest_root = merge_dataset_dir / "ai" / merge_subdir
    real_dest_root = merge_dataset_dir / "real" / merge_subdir
    if ai_dest_root.exists():
        shutil.rmtree(ai_dest_root)
    if real_dest_root.exists():
        shutil.rmtree(real_dest_root)

    copy_group(split_files["train_ai"], split_files["train_ai_root"], ai_dest_root / "train")
    copy_group(split_files["val_ai"], split_files["val_ai_root"], ai_dest_root / "val")
    copy_group(split_files["val_real"], split_files["val_real_root"], real_dest_root / "val")
    copy_group(sampled_train_real, split_files["train_real_root"], real_dest_root / "train")

    manifest_path = write_manifest(merge_dataset_dir)

    final_ai = count_images(merge_dataset_dir / "ai")
    final_real = count_images(merge_dataset_dir / "real")
    summary = {
        "existing_ai": existing_ai,
        "existing_real": existing_real,
        "added_ai": ai_additions,
        "added_real": len(split_files["val_real"]) + len(sampled_train_real),
        "added_train_real": len(sampled_train_real),
        "added_val_real": len(split_files["val_real"]),
        "final_ai": final_ai,
        "final_real": final_real,
    }
    (merge_dataset_dir / "kaggle-merge-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Merged Kaggle files into {merge_dataset_dir}")
    print(f"Saved manifest to {manifest_path}")
    return summary


def main() -> None:
    args = parse_args()
    ensure_kaggle_auth()

    archive_path = download_dataset(args.dataset, args.download_dir, args.force)
    extract_dir = args.download_dir / "extracted"
    extract_archive(archive_path, extract_dir, args.force)
    dataset_root = resolve_dataset_root(extract_dir)

    summary = stage_dataset(dataset_root, args.output_dir, args.seed)
    merge_summary = merge_into_dataset(dataset_root, args.merge_dataset_dir, args.merge_subdir, args.seed)
    print(f"Raw download ready at {args.download_dir}")
    print(f"Balanced dataset written to {args.output_dir}")
    print(json.dumps(summary, indent=2))
    print(json.dumps({"merge": merge_summary}, indent=2))


if __name__ == "__main__":
    main()