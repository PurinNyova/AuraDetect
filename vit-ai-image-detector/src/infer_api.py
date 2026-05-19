from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

print("Import transformers")
from transformers import AutoImageProcessor, AutoModelForImageClassification
print("Import torch")
import torch
print("Import PIL")
from PIL import Image, UnidentifiedImageError

print("Import Flask")
from flask import Flask, jsonify, request


DEFAULT_PROCESSOR_NAME = "google/vit-large-patch16-384"
DEFAULT_MODEL_DIR = Path("outputs/models/vit-full")

print("Start")
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve a long-lived ViT image classifier over HTTP.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def resolve_device(device_name: str) -> torch.device:
    if device_name == "cpu":
        return torch.device("cpu")
    if device_name == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is not available.")
        return torch.device("cuda")
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_processor(model_dir: Path) -> AutoImageProcessor:
    try:
        return AutoImageProcessor.from_pretrained(model_dir)
    except OSError:
        return AutoImageProcessor.from_pretrained(DEFAULT_PROCESSOR_NAME)


def load_runtime(model_dir: Path, device: torch.device) -> tuple[AutoModelForImageClassification, AutoImageProcessor]:
    model = AutoModelForImageClassification.from_pretrained(model_dir).to(device)
    model.eval()
    processor = load_processor(model_dir)
    return model, processor


def predict_image_bytes(
    image_bytes: bytes,
    model: AutoModelForImageClassification,
    processor: AutoImageProcessor,
    device: torch.device,
) -> dict[str, object]:
    with Image.open(io.BytesIO(image_bytes)) as image:
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
        "predicted_label": id2label[predicted_id],
        "verdict": id2label[predicted_id],
        "confidence": round(float(probabilities[predicted_id].item()), 6),
        "scores": scores,
    }


def create_app(
    model_dir: Path = DEFAULT_MODEL_DIR,
    device_name: str = "auto",
) -> Flask:
    device = resolve_device(device_name)
    model, processor = load_runtime(model_dir, device)

    app = Flask(__name__)
    app.config["MODEL_DIR"] = str(model_dir)
    app.config["DEVICE"] = str(device)

    @app.get("/health")
    def health() -> tuple[dict[str, object], int]:
        return {
            "status": "ok",
            "device": str(device),
            "model_dir": str(model_dir),
        }, 200

    @app.post("/ai-scan")
    def ai_scan() -> tuple[object, int]:
        upload = request.files.get("image")
        if upload is None:
            return jsonify({"error": "Missing image upload. Send multipart/form-data with an 'image' file."}), 400

        image_bytes = upload.read()
        if not image_bytes:
            return jsonify({"error": "Uploaded file is empty."}), 400

        try:
            result = predict_image_bytes(image_bytes, model, processor, device)
        except UnidentifiedImageError:
            return jsonify({"error": "Uploaded file is not a supported image."}), 400
        except OSError as exc:
            return jsonify({"error": f"Failed to read uploaded image: {exc}"}), 400
        except Exception as exc:
            return jsonify({"error": f"Inference failed: {exc}"}), 500

        result["filename"] = upload.filename or "uploaded-image"
        return jsonify(result), 200

    return app


def main() -> None:
    args = parse_args()
    app = create_app(model_dir=args.model_dir, device_name=args.device)

    print(f"Using device: {app.config['DEVICE']}")
    print(f"Loading model from: {app.config['MODEL_DIR']}")
    print(f"Serving on http://{args.host}:{args.port}")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()