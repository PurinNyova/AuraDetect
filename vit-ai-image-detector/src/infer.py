from __future__ import annotations

print("Import Argparse")
import argparse

print("Import JSON")
import json

print("Import Pathlib")
from pathlib import Path

print("Import Transformers")
from transformers import AutoImageProcessor, AutoModelForImageClassification

print("Import Torch")
import torch

print("Import PIL")
from PIL import Image

print("Import TQ DM")
from tqdm.auto import tqdm


DEFAULT_PROCESSOR_NAME = "google/vit-large-patch16-384"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}

print("[DEBUG] define parse_args")
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run inference with a fine-tuned ViT image classifier.")
    parser.add_argument("input_path", type=Path, help="Path to an image file or a directory of images.")
    parser.add_argument("--model-dir", type=Path, default=Path("outputs/models/vit-full"))
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--recursive", action="store_true", help="Recurse into subdirectories when input_path is a directory.")
    parser.add_argument("--output-json", type=Path, default=None, help="Optional path to save predictions as JSON.")
    return parser.parse_args()

print("[DEBUG] define resolve_device")
def resolve_device(device_name: str) -> torch.device:
    if device_name == "cpu":
        return torch.device("cpu")
    if device_name == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is not available.")
        return torch.device("cuda")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")

print("[DEBUG] define collect_image_paths")
def collect_image_paths(input_path: Path, recursive: bool) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image format: {input_path.suffix}")
        return [input_path]

    if not input_path.is_dir():
        raise FileNotFoundError(f"Input path does not exist: {input_path}")

    pattern = "**/*" if recursive else "*"
    image_paths = [path for path in sorted(input_path.glob(pattern)) if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS]
    if not image_paths:
        raise RuntimeError(f"No images found under {input_path}")
    return image_paths

print("[DEBUG] define load_processor")
def load_processor(model_dir: Path) -> AutoImageProcessor:
    try:
        return AutoImageProcessor.from_pretrained(model_dir)
    except OSError:
        return AutoImageProcessor.from_pretrained(DEFAULT_PROCESSOR_NAME)

print("[DEBUG] define predict_image")
def predict_image(
    image_path: Path,
    model: AutoModelForImageClassification,
    processor: AutoImageProcessor,
    device: torch.device,
) -> dict[str, object]:
    with Image.open(image_path) as image:
        rgb_image = image.convert("RGB")

    inputs = processor(images=rgb_image, return_tensors="pt")
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits

    probabilities = torch.softmax(logits, dim=-1).squeeze(0).cpu()
    predicted_id = int(torch.argmax(probabilities).item())
    id2label = {int(key): value for key, value in model.config.id2label.items()}
    scores = {
        id2label[index]: round(float(score), 6)
        for index, score in enumerate(probabilities.tolist())
    }

    return {
        "path": str(image_path),
        "predicted_label": id2label[predicted_id],
        "confidence": round(float(probabilities[predicted_id].item()), 6),
        "scores": scores,
    }

print("[DEBUG] define main")
def main() -> None:
    args = parse_args()
    device = resolve_device(args.device)
    image_paths = collect_image_paths(args.input_path, recursive=args.recursive)

    print(f"Using device: {device}")
    print(f"Loading model from: {args.model_dir}")
    model = AutoModelForImageClassification.from_pretrained(args.model_dir).to(device)
    model.eval()

    processor = load_processor(args.model_dir)
    results: list[dict[str, object]] = []

    for image_path in tqdm(image_paths, desc="infer", unit="image"):
        result = predict_image(image_path, model, processor, device)
        results.append(result)
        print(
            f"{result['path']} -> {result['predicted_label']} "
            f"(confidence={result['confidence']:.4f}, scores={json.dumps(result['scores'])})"
        )

    if args.output_json is not None:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"Saved predictions to {args.output_json}")


if __name__ == "__main__":
    main()