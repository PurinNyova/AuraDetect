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
DEFAULT_AI_VERDICT_THRESHOLD = 0.75

print("Start")
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve a long-lived ViT image classifier over HTTP.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    parser.add_argument(
        "--ai-verdict-threshold",
        type=float,
        default=DEFAULT_AI_VERDICT_THRESHOLD,
        help=(
            "Minimum AI-class probability (0.0-1.0) required before a scan is "
            "counted as 'Ai'. Below this threshold the verdict falls back to "
            "'Real'. Defaults to 0.75."
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
    ai_label: str | None,
    ai_score: float | None,
    threshold: float,
) -> str:
    """Apply the AI verdict threshold.

    The verdict is the AI label only when the AI class probability is at or
    above ``threshold``. Otherwise the verdict falls back to the opposing
    (real/authentic) class so a low-confidence prediction is not counted as AI.
    """
    if ai_label is not None and ai_score is not None and ai_score >= threshold:
        return ai_label
    if ai_label is not None and predicted_label != ai_label:
        return predicted_label
    # No AI class configured, or the model picked AI but below threshold:
    # fall back to the most likely non-AI label.
    return "Real"


def predict_image_bytes(
    image_bytes: bytes,
    model: AutoModelForImageClassification,
    processor: AutoImageProcessor,
    device: torch.device,
    ai_verdict_threshold: float = DEFAULT_AI_VERDICT_THRESHOLD,
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

    ai_index = find_ai_label_index(id2label)
    ai_label = id2label.get(ai_index) if ai_index is not None else None
    ai_score = float(probabilities_list[ai_index]) if ai_index is not None else None

    verdict = resolve_verdict(
        predicted_label=id2label[predicted_id],
        ai_label=ai_label,
        ai_score=ai_score,
        threshold=ai_verdict_threshold,
    )

    return {
        "predicted_label": id2label[predicted_id],
        "verdict": verdict,
        "confidence": round(float(probabilities_list[predicted_id]), 6),
        "ai_score": round(ai_score, 6) if ai_score is not None else None,
        "verdict_threshold": ai_verdict_threshold,
        "scores": scores,
    }


def create_app(
    model_dir: Path = DEFAULT_MODEL_DIR,
    device_name: str = "auto",
    ai_verdict_threshold: float = DEFAULT_AI_VERDICT_THRESHOLD,
) -> Flask:
    device = resolve_device(device_name)
    model, processor = load_runtime(model_dir, device)

    app = Flask(__name__)
    app.config["MODEL_DIR"] = str(model_dir)
    app.config["DEVICE"] = str(device)
    app.config["AI_VERDICT_THRESHOLD"] = ai_verdict_threshold

    @app.get("/health")
    def health() -> tuple[dict[str, object], int]:
        return {
            "status": "ok",
            "device": str(device),
            "model_dir": str(model_dir),
            "ai_verdict_threshold": ai_verdict_threshold,
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
                ai_verdict_threshold=ai_verdict_threshold,
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
        ai_verdict_threshold=args.ai_verdict_threshold,
    )

    print(f"Using device: {app.config['DEVICE']}")
    print(f"Loading model from: {app.config['MODEL_DIR']}")
    print(f"AI verdict threshold: {app.config['AI_VERDICT_THRESHOLD']:.4f}")
    print(f"Serving on http://{args.host}:{args.port}")

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()