from __future__ import annotations

import argparse
import json
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
LABELS = ("real", "ai")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare and validate a manual image dataset.")
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("data/dataset"),
        help="Directory that contains the manual dataset folders.",
    )
    return parser.parse_args()


def ensure_dataset_layout(dataset_dir: Path) -> None:
    dataset_dir.mkdir(parents=True, exist_ok=True)

    for label_name in LABELS:
        label_dir = dataset_dir / label_name
        label_dir.mkdir(parents=True, exist_ok=True)


def build_manifest(dataset_dir: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []

    for label_name in LABELS:
        label_dir = dataset_dir / label_name
        for path in sorted(label_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                records.append(
                    {
                        "label": label_name,
                        "path": str(path.relative_to(dataset_dir).as_posix()),
                    }
                )

    return records


def main() -> None:
    args = parse_args()
    ensure_dataset_layout(args.dataset_dir)

    manifest = build_manifest(args.dataset_dir)
    manifest_path = args.dataset_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    counts = {label_name: 0 for label_name in LABELS}
    for record in manifest:
        counts[record["label"]] += 1

    print(f"Dataset directory ready at {args.dataset_dir}")
    for label_name in LABELS:
        print(f"  {label_name}: {counts[label_name]} image(s)")

    print(f"Saved manifest to {manifest_path}")

    if not manifest:
        print("Add images under 'real/' and 'ai/' and rerun this script before training.")


if __name__ == "__main__":
    main()
