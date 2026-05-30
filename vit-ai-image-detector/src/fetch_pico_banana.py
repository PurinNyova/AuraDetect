import requests
import os
from pathlib import Path
from urllib.parse import urlparse
import time
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# Configuration
MANIFEST_URL = "https://ml-site.cdn-apple.com/datasets/pico-banana-300k/nb/manifest/sft_manifest.txt"
OUTPUT_DIR = Path("../data/dataset/train/ai/pico-banana")
NUM_IMAGES = 10000
TIMEOUT = 30
MAX_WORKERS = 32
PROGRESS_EVERY = 100

def log(message):
    """Log with timestamp and flush output immediately"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)

def fetch_manifest():
    """Fetch the manifest file"""
    log(f"Fetching manifest from {MANIFEST_URL}...")
    try:
        response = requests.get(MANIFEST_URL, timeout=TIMEOUT)
        response.raise_for_status()
        lines = response.text.strip().split('\n')
        log(f"✓ Manifest fetched successfully")
        return lines
    except requests.RequestException as e:
        log(f"✗ Error fetching manifest: {e}")
        return []


def build_target_path(idx, url):
    """Build a deterministic output path for a manifest entry."""
    parsed_url = urlparse(url)
    filename = os.path.basename(parsed_url.path)

    # If no filename in path, use a stable fallback based on index.
    if not filename or "." not in filename:
        filename = f"image_{idx:06d}.jpg"

    return OUTPUT_DIR / filename


def download_one(item):
    """Download a single URL. Returns a tuple: (status, detail)."""
    idx, url = item
    clean_url = url.strip()
    if not clean_url:
        return ("failed", "empty URL")

    filepath = build_target_path(idx, clean_url)
    if filepath.exists():
        return ("skipped", filepath.name)

    try:
        response = requests.get(clean_url, timeout=TIMEOUT)
        response.raise_for_status()
        with open(filepath, "wb") as f:
            f.write(response.content)
        return ("downloaded", filepath.name)
    except requests.RequestException as e:
        return ("failed", f"{clean_url[:60]}...: {str(e)[:120]}")

def download_images(image_urls):
    """Download images from the provided URLs"""
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    log(f"Output directory: {OUTPUT_DIR.absolute()}")
    log(f"Starting download of up to {NUM_IMAGES:,} images with {MAX_WORKERS} threads...")
    
    downloaded = 0
    failed = 0
    skipped = 0
    error_logs = 0
    start_time = time.time()
    counter_lock = Lock()
    target_urls = image_urls[:NUM_IMAGES]
    total_items = len(target_urls)

    def log_progress(force=False):
        total_processed = downloaded + failed + skipped
        if not force and total_processed % PROGRESS_EVERY != 0:
            return
        elapsed = time.time() - start_time
        rate = total_processed / elapsed if elapsed > 0 else 0
        log(
            f"Progress: {total_processed:,}/{total_items:,} | "
            f"Downloaded: {downloaded:,} | Failed: {failed:,} | "
            f"Skipped: {skipped:,} | Rate: {rate:.1f} items/sec"
        )
    
    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [executor.submit(download_one, (idx, url)) for idx, url in enumerate(target_urls)]

            for future in as_completed(futures):
                status, detail = future.result()
                with counter_lock:
                    if status == "downloaded":
                        downloaded += 1
                    elif status == "skipped":
                        skipped += 1
                    else:
                        failed += 1
                        if error_logs < 10:
                            log(f"✗ Error downloading {detail}")
                            error_logs += 1

                    log_progress(force=False)
    except KeyboardInterrupt:
        log(f"\n⚠ Download interrupted by user at {downloaded + failed + skipped}/{total_items}")
    
    elapsed = time.time() - start_time
    total_processed = downloaded + failed + skipped
    log_progress(force=True)
    log(f"\n{'='*60}")
    log(f"Download complete!")
    log(f"Successfully downloaded: {downloaded:,}")
    log(f"Failed: {failed:,}")
    log(f"Skipped (already exist): {skipped:,}")
    log(f"Total processed: {total_processed:,}")
    log(f"Time elapsed: {elapsed:.1f} seconds")
    if elapsed > 0:
        log(f"Average speed: {total_processed / elapsed:.1f} items/sec")
    log(f"{'='*60}")

if __name__ == "__main__":
    log("="*60)
    log("Pico Banana Dataset Downloader")
    log("="*60)
    
    # Fetch manifest
    image_urls = fetch_manifest()
    
    if not image_urls:
        log("✗ No images found in manifest!")
    else:
        log(f"✓ Found {len(image_urls):,} images in manifest\n")
        download_images(image_urls)
