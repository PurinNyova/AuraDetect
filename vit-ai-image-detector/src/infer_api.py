from __future__ import annotations

import argparse
import io
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
# Firm AI/Real verdict only at or above this confidence.
DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.85
# Below this, the model is near a coin-flip → "Unsure it's X".
# Between mid and high → "Possibly X".
DEFAULT_MID_CONFIDENCE_THRESHOLD = 0.65

print("Start")
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve a long-lived ViT image classifier over HTTP.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument(
        "--high-confidence-threshold",
        type=float,
        default=DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
        help=(
            "Minimum top-class probability (0.0-1.0) for a firm AI/Real verdict. "
            "Defaults to 0.85."
        ),
    )
    parser.add_argument(
        "--mid-confidence-threshold",
        type=float,
        default=DEFAULT_MID_CONFIDENCE_THRESHOLD,
        help=(
            "Minimum top-class probability (0.0-1.0) for a 'Possibly X' verdict. "
            "Below this the API returns 'Unsure it's X'. Defaults to 0.65. "
            "Must be less than --high-confidence-threshold."
        ),
    )
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


def find_ai_label_index(id2label: dict[int, str]) -> int | None:
    """Locate the index of the AI class in the model's id2label mapping.

    Matches case-insensitively against common AI label tokens ("ai", "fake",
    "generated"). Returns None when no AI class is present (e.g. unexpected
    model config).
    """
    aliases = ("ai", "fake", "generated")
    for index, label in id2label.items():
        normalized = label.strip().lower().replace("-", " ").replace("_", " ")
        if normalized in aliases or any(token in normalized.split() for token in aliases):
            return index
    return None


def resolve_verdict(
    predicted_label: str,
    confidence: float,
    high_threshold: float = DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    mid_threshold: float = DEFAULT_MID_CONFIDENCE_THRESHOLD,
) -> str:
    """Map top-class confidence into a tiered verdict with uncertainty.

    - confidence >= high_threshold → firm label (e.g. ``AI`` / ``Real``)
    - mid_threshold <= confidence < high_threshold → ``Possibly {label}``
    - confidence < mid_threshold → ``Unsure it's {label}``
    """
    label = predicted_label.strip() or "Unknown"
    if confidence >= high_threshold:
        return label
    if confidence >= mid_threshold:
        return f"Possibly {label}"
    return f"Unsure it's {label}"


def predict_image_bytes(
    image_bytes: bytes,
    model: AutoModelForImageClassification,
    processor: AutoImageProcessor,
    device: torch.device,
    high_confidence_threshold: float = DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    mid_confidence_threshold: float = DEFAULT_MID_CONFIDENCE_THRESHOLD,
) -> dict[str, object]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        rgb_image = image.convert("RGB")

    inputs = processor(images=rgb_image, return_tensors="pt")
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits

    probabilities = torch.softmax(logits, dim=-1).squeeze(0).cpu()
    probabilities_list = probabilities.tolist()
    predicted_id = int(torch.argmax(probabilities).item())
    id2label = {int(key): value for key, value in model.config.id2label.items()}
    scores = {
        id2label[index]: round(float(score), 6)
        for index, score in enumerate(probabilities_list)
    }

    predicted_label = id2label[predicted_id]
    confidence = float(probabilities_list[predicted_id])

    ai_index = find_ai_label_index(id2label)
    ai_score = float(probabilities_list[ai_index]) if ai_index is not None else None

    verdict = resolve_verdict(
        predicted_label=predicted_label,
        confidence=confidence,
        high_threshold=high_confidence_threshold,
        mid_threshold=mid_confidence_threshold,
    )

    return {
        "predicted_label": predicted_label,
        "verdict": verdict,
        "confidence": round(confidence, 6),
        "ai_score": round(ai_score, 6) if ai_score is not None else None,
        "high_confidence_threshold": high_confidence_threshold,
        "mid_confidence_threshold": mid_confidence_threshold,
        "scores": scores,
    }


def create_app(
    model_dir: Path = DEFAULT_MODEL_DIR,
    device_name: str = "auto",
    high_confidence_threshold: float = DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    mid_confidence_threshold: float = DEFAULT_MID_CONFIDENCE_THRESHOLD,
) -> Flask:
    if not 0.0 <= mid_confidence_threshold < high_confidence_threshold <= 1.0:
        raise ValueError(
            "Confidence thresholds must satisfy "
            "0 <= mid_confidence_threshold < high_confidence_threshold <= 1 "
            f"(got mid={mid_confidence_threshold}, high={high_confidence_threshold})."
        )

    device = resolve_device(device_name)
    model, processor = load_runtime(model_dir, device)

    app = Flask(__name__)
    app.config["MODEL_DIR"] = str(model_dir)
    app.config["DEVICE"] = str(device)
    app.config["HIGH_CONFIDENCE_THRESHOLD"] = high_confidence_threshold
    app.config["MID_CONFIDENCE_THRESHOLD"] = mid_confidence_threshold

    @app.get("/health")
    def health() -> tuple[dict[str, object], int]:
        return {
            "status": "ok",
            "device": str(device),
            "model_dir": str(model_dir),
            "high_confidence_threshold": high_confidence_threshold,
            "mid_confidence_threshold": mid_confidence_threshold,
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
            result = predict_image_bytes(
                image_bytes,
                model,
                processor,
                device,
                high_confidence_threshold=high_confidence_threshold,
                mid_confidence_threshold=mid_confidence_threshold,
            )
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
    app = create_app(
        model_dir=args.model_dir,
        device_name=args.device,
        high_confidence_threshold=args.high_confidence_threshold,
        mid_confidence_threshold=args.mid_confidence_threshold,
    )

    print(f"Using device: {app.config['DEVICE']}")
    print(f"Loading model from: {app.config['MODEL_DIR']}")
    print(
        "Confidence thresholds: "
        f"high={app.config['HIGH_CONFIDENCE_THRESHOLD']:.4f}, "
        f"mid={app.config['MID_CONFIDENCE_THRESHOLD']:.4f}"
    )
    print(f"Serving on http://{args.host}:{args.port}")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()