from __future__ import annotations

import argparse
import hashlib
import json
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from datasets import IterableDataset, load_dataset
from PIL import Image, UnidentifiedImageError

from data_fetch import build_manifest, ensure_dataset_layout


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
DEFAULT_DATASET = "laion/laion400m"
DEFAULT_OUTPUT_SUBDIR = Path("real") / "laion-400m"
USER_AGENT = "AuraDetect-LAION-Downloader/1.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download roughly 10,000 real images from LAION-400M into data/dataset/real/."
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=Path("data/dataset"),
        help="Root dataset directory used by the training pipeline.",
    )
    parser.add_argument(
        "--output-subdir",
        type=Path,
        default=DEFAULT_OUTPUT_SUBDIR,
        help="Subdirectory inside the dataset root where downloaded images are stored.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10_000,
        help="Target number of successfully downloaded images.",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=50_000,
        help="Maximum streamed LAION records to inspect before stopping.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=24,
        help="Number of concurrent image downloads.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Per-request timeout in seconds.",
    )
    parser.add_argument(
        "--shuffle-buffer",
        type=int,
        default=50_000,
        help="Streaming shuffle buffer size used before taking samples.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Shuffle seed for repeatable sampling.",
    )
    return parser.parse_args()


def discover_existing_count(output_dir: Path) -> int:
    if not output_dir.exists():
        return 0

    count = 0
    for path in output_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            count += 1
    return count


def load_laion_stream(dataset_name: str, shuffle_buffer: int, seed: int) -> IterableDataset:
    dataset = load_dataset(dataset_name, split="train", streaming=True)
    return dataset.shuffle(buffer_size=shuffle_buffer, seed=seed)


def extract_url(record: dict[str, Any]) -> str | None:
    for key in ("URL", "url", "image_url"):
        value = record.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def extract_caption(record: dict[str, Any]) -> str:
    for key in ("TEXT", "text", "caption"):
        value = record.get(key)
        if isinstance(value, str):
            return value
    return ""


def sanitize_extension(url: str, image: Image.Image) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        return suffix

    image_format = (image.format or "jpeg").lower()
    if image_format == "jpg":
        image_format = "jpeg"
    return f".{image_format}"


def build_output_paths(output_dir: Path, url: str, image: Image.Image) -> tuple[Path, Path]:
    url_hash = hashlib.sha1(url.encode("utf-8")).hexdigest()
    extension = sanitize_extension(url, image)
    image_path = output_dir / f"{url_hash}{extension}"
    metadata_path = output_dir / f"{url_hash}.json"
    return image_path, metadata_path


def resolve_save_format(image_path: Path) -> str | None:
    suffix = image_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "JPEG"
    if suffix == ".png":
        return "PNG"
    if suffix == ".webp":
        return "WEBP"
    if suffix == ".bmp":
        return "BMP"
    return None


def download_record(record: dict[str, Any], output_dir: Path, timeout: float) -> bool:
    url = extract_url(record)
    if not url:
        return False

    try:
        response = requests.get(
            url,
            timeout=timeout,
            stream=True,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()

        content_type = response.headers.get("Content-Type", "")
        if content_type and not content_type.lower().startswith("image/"):
            return False

        payload = response.content
        image = Image.open(BytesIO(payload))
        image.load()
        image_path, metadata_path = build_output_paths(output_dir, url, image)

        if image_path.exists():
            return False

        if image.mode != "RGB":
            image = image.convert("RGB")

        save_format = resolve_save_format(image_path)
        if save_format:
            image.save(image_path, format=save_format)
        else:
            image.save(image_path)
        metadata_path.write_text(
            json.dumps(
                {
                    "url": url,
                    "caption": extract_caption(record),
                    "width": image.width,
                    "height": image.height,
                },
                ensure_ascii=True,
                indent=2,
            ),
            encoding="utf-8",
        )
        return True
    except (requests.RequestException, OSError, UnidentifiedImageError):
        return False


def write_manifest(dataset_dir: Path) -> Path:
    manifest = build_manifest(dataset_dir)
    manifest_path = dataset_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def schedule_downloads(
    stream: IterableDataset,
    output_dir: Path,
    target_total: int,
    existing_count: int,
    max_attempts: int,
    workers: int,
    timeout: float,
) -> tuple[int, int]:
    successful = existing_count
    attempts = 0
    pending: set[Future[bool]] = set()
    iterator = iter(stream)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        while successful < target_total:
            while attempts < max_attempts and len(pending) < workers and successful + len(pending) < target_total:
                try:
                    record = next(iterator)
                except StopIteration:
                    break

                attempts += 1
                pending.add(executor.submit(download_record, record, output_dir, timeout))

            if not pending:
                break

            done, pending = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                if future.result():
                    successful += 1
                    if successful % 250 == 0 or successful == target_total:
                        print(f"Downloaded {successful}/{target_total} image(s)...")

    return successful, attempts


def main() -> None:
    args = parse_args()
    if args.limit <= 0:
        raise ValueError("--limit must be greater than 0.")
    if args.max_attempts < args.limit:
        raise ValueError("--max-attempts must be greater than or equal to --limit.")
    if args.workers <= 0:
        raise ValueError("--workers must be greater than 0.")

    ensure_dataset_layout(args.dataset_dir)
    output_dir = args.dataset_dir / args.output_subdir
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_count = discover_existing_count(output_dir)
    if existing_count >= args.limit:
        manifest_path = write_manifest(args.dataset_dir)
        print(f"Found {existing_count} existing LAION image(s) under {output_dir}.")
        print(f"Target already satisfied; refreshed manifest at {manifest_path}.")
        return

    print(f"Streaming shuffled LAION records from {DEFAULT_DATASET}...")
    print(f"Saving downloads to {output_dir}")
    print(f"Existing images: {existing_count}")

    stream = load_laion_stream(DEFAULT_DATASET, args.shuffle_buffer, args.seed)
    successful, attempts = schedule_downloads(
        stream=stream,
        output_dir=output_dir,
        target_total=args.limit,
        existing_count=existing_count,
        max_attempts=args.max_attempts,
        workers=args.workers,
        timeout=args.timeout,
    )

    manifest_path = write_manifest(args.dataset_dir)
    print(f"Sampled {attempts} LAION record(s).")
    print(f"Stored {successful} image(s) in {output_dir}.")
    print(f"Saved manifest to {manifest_path}")

    if successful < args.limit:
        print(
            "Stopped before reaching the target count. Increase --max-attempts or rerun the script to keep filling the folder."
        )


if __name__ == "__main__":
    main()