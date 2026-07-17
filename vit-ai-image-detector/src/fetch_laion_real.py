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
DEFAULT_DATASET = "laion/laion2B-en-aesthetic"
DEFAULT_OUTPUT_SUBDIR = Path("real") / "laion-5b"
USER_AGENT = "AuraDetect-LAION-Downloader/1.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download roughly 10,000 real images from a LAION-5B-derived stream into data/dataset/real/."
    )
    parser.add_argument(
        "--dataset-name",
        default=DEFAULT_DATASET,
        help="Hugging Face dataset identifier to stream metadata from.",
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
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Number of shuffled LAION records to skip before attempting downloads.",
    )
    parser.add_argument(
        "--min-width",
        type=int,
        default=0,
        help="Reject images narrower than this many pixels.",
    )
    parser.add_argument(
        "--min-height",
        type=int,
        default=0,
        help="Reject images shorter than this many pixels.",
    )
    parser.add_argument(
        "--max-width",
        type=int,
        default=None,
        help="Reject images wider than this many pixels.",
    )
    parser.add_argument(
        "--max-height",
        type=int,
        default=None,
        help="Reject images taller than this many pixels.",
    )
    parser.add_argument(
        "--exclude-subdirs",
        type=Path,
        nargs="*",
        default=None,
        help=(
            "Additional subdirectories under --dataset-dir whose images are treated "
            "as already collected. URLs whose SHA-1 hash matches an existing file "
            "in any of these directories are skipped, enabling cross-set deduplication."
        ),
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


def collect_existing_hashes(*dirs: Path) -> set[str]:
    """Return the set of SHA-1 URL hashes already present in the given directories.

    Hashes are derived from image filenames (the script names files as
    ``{url_hash}{ext}``), so this works even if the JSON sidecars are missing.
    """
    hashes: set[str] = set()
    for directory in dirs:
        if directory is None or not directory.exists():
            continue
        for path in directory.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            stem = path.stem
            if stem:
                hashes.add(stem)
    return hashes


def url_hash(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


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


def matches_resolution(
    image: Image.Image,
    min_width: int,
    min_height: int,
    max_width: int | None,
    max_height: int | None,
) -> bool:
    width, height = image.size
    if width < min_width or height < min_height:
        return False
    if max_width is not None and width > max_width:
        return False
    if max_height is not None and height > max_height:
        return False
    return True


def download_record(
    record: dict[str, Any],
    output_dir: Path,
    timeout: float,
    min_width: int,
    min_height: int,
    max_width: int | None,
    max_height: int | None,
    excluded_hashes: set[str] | None = None,
) -> bool:
    url = extract_url(record)
    if not url:
        return False

    if excluded_hashes and url_hash(url) in excluded_hashes:
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

        if not matches_resolution(image, min_width, min_height, max_width, max_height):
            return False

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


def apply_offset(stream: IterableDataset, offset: int) -> IterableDataset:
    if offset <= 0:
        return stream

    iterator = iter(stream)
    skipped = 0
    while skipped < offset:
        try:
            next(iterator)
        except StopIteration:
            break
        skipped += 1

    return iterator


def schedule_downloads(
    stream: IterableDataset,
    output_dir: Path,
    target_total: int,
    existing_count: int,
    max_attempts: int,
    workers: int,
    timeout: float,
    min_width: int,
    min_height: int,
    max_width: int | None,
    max_height: int | None,
    excluded_hashes: set[str] | None = None,
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
                pending.add(
                    executor.submit(
                        download_record,
                        record,
                        output_dir,
                        timeout,
                        min_width,
                        min_height,
                        max_width,
                        max_height,
                        excluded_hashes,
                    )
                )

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
    if args.offset < 0:
        raise ValueError("--offset must be greater than or equal to 0.")
    if args.min_width < 0:
        raise ValueError("--min-width must be greater than or equal to 0.")
    if args.min_height < 0:
        raise ValueError("--min-height must be greater than or equal to 0.")
    if args.max_width is not None and args.max_width <= 0:
        raise ValueError("--max-width must be greater than 0 when provided.")
    if args.max_height is not None and args.max_height <= 0:
        raise ValueError("--max-height must be greater than 0 when provided.")
    if args.max_width is not None and args.max_width < args.min_width:
        raise ValueError("--max-width must be greater than or equal to --min-width.")
    if args.max_height is not None and args.max_height < args.min_height:
        raise ValueError("--max-height must be greater than or equal to --min-height.")

    ensure_dataset_layout(args.dataset_dir)
    output_dir = args.dataset_dir / args.output_subdir
    output_dir.mkdir(parents=True, exist_ok=True)

    excluded_dirs: list[Path] = []
    if args.exclude_subdirs:
        for sub in args.exclude_subdirs:
            excluded_dirs.append(args.dataset_dir / sub)
    excluded_hashes = collect_existing_hashes(*excluded_dirs) if excluded_dirs else set()
    if excluded_hashes:
        print(f"Loaded {len(excluded_hashes)} URL hash(es) from excluded sets for cross-set deduplication.")

    existing_count = discover_existing_count(output_dir)
    if existing_count >= args.limit:
        manifest_path = write_manifest(args.dataset_dir)
        print(f"Found {existing_count} existing LAION image(s) under {output_dir}.")
        print(f"Target already satisfied; refreshed manifest at {manifest_path}.")
        return

    print(f"Streaming shuffled LAION records from {args.dataset_name}...")
    print(f"Saving downloads to {output_dir}")
    print(f"Existing images: {existing_count}")
    if args.offset:
        print(f"Skipping the first {args.offset} shuffled LAION record(s).")
    if args.min_width or args.min_height or args.max_width is not None or args.max_height is not None:
        print(
            "Resolution filter: "
            f"min={args.min_width}x{args.min_height}, "
            f"max={args.max_width or 'unbounded'}x{args.max_height or 'unbounded'}"
        )

    stream = load_laion_stream(args.dataset_name, args.shuffle_buffer, args.seed)
    stream = apply_offset(stream, args.offset)
    successful, attempts = schedule_downloads(
        stream=stream,
        output_dir=output_dir,
        target_total=args.limit,
        existing_count=existing_count,
        max_attempts=args.max_attempts,
        workers=args.workers,
        timeout=args.timeout,
        min_width=args.min_width,
        min_height=args.min_height,
        max_width=args.max_width,
        max_height=args.max_height,
        excluded_hashes=excluded_hashes or None,
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