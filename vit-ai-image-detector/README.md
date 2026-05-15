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

Start fine-tuning:

```powershell
python src/train.py --epochs 3 --batch-size 8
```

## Training Notes

- The script uses `cuda` automatically when `torch.cuda.is_available()` is true.
- The ViT backbone is frozen and only the classifier head is optimized.
- Checkpoints and label metadata are stored under `outputs/models/`.
