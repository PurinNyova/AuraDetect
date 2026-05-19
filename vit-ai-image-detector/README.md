# ViT AI Image Detector

This project fine-tunes `google/vit-large-patch16-384` for binary image classification:

- `0 = Real`
- `1 = AI`

The pipeline uses transfer learning with a frozen ViT backbone and a trainable classification head. Images are resized to `384x384` through Hugging Face's `ViTImageProcessor`, and the training loop reports Accuracy, F1, and ROC AUC for both training and validation.

## Dataset

The training pipeline now expects a manual dataset layout under `data/dataset/`:

```text
data/
└── dataset/
	├── real/
	└── ai/
```

Put your real images into `data/dataset/real/` and your AI-generated images into `data/dataset/ai/`. Nested folders are supported.

## Project Layout

```text
vit-ai-image-detector/
├── data/
│   ├── dataset/
│   └── processed/
├── notebooks/
├── outputs/
│   └── models/
├── src/
│   ├── models/
│   ├── utils/
│   ├── data_fetch.py
│   ├── dataset.py
│   └── train.py
├── .gitignore
└── requirements.txt
```

## Environment Setup

Create the local conda prefix environment:

```powershell
conda create --prefix ./env python=3.10 -y
```

Activate it from the project root:

```powershell
conda activate ./env
```

Install PyTorch using the CUDA 12.x wheels that work with the host CUDA 12.6 driver:

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

Install the remaining dependencies:

```powershell
pip install transformers datasets accelerate scikit-learn pillow albumentations jupyterlab kaggle
```

## Usage

Create the dataset folders and generate a manifest:

```powershell
python src/data_fetch.py
```

After that, place your images into `data/dataset/real/` and `data/dataset/ai/`, then rerun `python src/data_fetch.py` if you want to refresh `manifest.json`.

To bootstrap the `real/` class from LAION-400M with roughly 10,000 sampled images:

```powershell
python src/fetch_laion_real.py --limit 10000
```

The script streams shuffled LAION metadata from Hugging Face, downloads successful image URLs into `data/dataset/real/laion-400m/`, and refreshes `data/dataset/manifest.json`. Some source URLs will be dead or blocked, so the script may need a second run or a higher `--max-attempts` value to fully reach the target count.

To download the Kaggle `factfry/15k-ai-nonai-images` dataset and build a balanced split that keeps `val/` intact, copies all of `train/ai`, and downsamples `train/real` to the same count:

```powershell
python src/fetch_kaggle_balanced.py
```

The raw Kaggle archive is stored under `data/raw/factfry-15k-ai-nonai-images/`. The staged output is written to `data/processed/factfry-15k-balanced/` with normalized labels under `train/{ai,real}` and `val/{ai,real}`. Set `KAGGLE_USERNAME` and `KAGGLE_KEY` in `.env` or provide `~/.kaggle/kaggle.json` before running it.

Start fine-tuning:

```powershell
python src/train.py --epochs 3 --batch-size 8
```

Run inference on one image or a whole folder:

```powershell
python src/infer.py .\data\dataset\val\ai\example.png --model-dir .\outputs\models\vit-full
python src/infer.py .\data\dataset\val --model-dir .\outputs\models\vit-full --recursive --output-json .\outputs\predictions\val.json
```

Run the long-lived Flask inference API:

```powershell
python src/infer_api.py --model-dir .\outputs\models\vit-full --host 0.0.0.0 --port 5000
```

Send an image to the API:

```powershell
curl.exe -X POST http://127.0.0.1:5000/ai-scan -F "image=@data\dataset\val\ai\example.png"
```

The API keeps the model loaded in memory and returns a JSON payload with the predicted `AI`/`Real` verdict, the top confidence value, and the per-label scores.

## Training Notes

- The script uses `cuda` automatically when `torch.cuda.is_available()` is true.
- The ViT backbone is frozen and only the classifier head is optimized.
- Checkpoints and label metadata are stored under `outputs/models/`.
