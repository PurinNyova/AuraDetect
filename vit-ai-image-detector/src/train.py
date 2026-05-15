"""
Training script for fine-tuning a Vision Transformer (ViT) model to classify AI-generated vs real images.

This script:
1. Loads and prepares the dataset
2. Configures a pre-trained ViT model for binary classification
3. Trains the model using only the classifier head (transfer learning)
4. Evaluates performance on validation data
5. Saves the trained model and training history
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import AutoModelForImageClassification

from dataset import AiImageDataset, LABEL_TO_ID

# Configuration: Use Google's Vision Transformer (ViT) large model with 384x384 patches
MODEL_NAME = "google/vit-large-patch16-384"

# Create reverse mapping from numeric IDs (0, 1) to human-readable labels ("Real", "Fake")
ID_TO_LABEL = {value: key.capitalize() for key, value in LABEL_TO_ID.items()}


# Parse command-line arguments for training configuration.
#
# Returns:
#     argparse.Namespace: Parsed arguments containing:
#         - data_dir: Directory containing train/val image folders
#         - output_dir: Where to save the trained model and metrics
#         - epochs: Number of complete passes through the training data
#         - batch_size: Number of images to process simultaneously
#         - learning_rate: Step size for optimizer (1e-4 = 0.0001)
#         - num_workers: Number of parallel data loading processes
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune ViT on AI vs real images.")
    parser.add_argument("--data-dir", type=Path, default=Path("data/dataset"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/models"))
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=2)
    return parser.parse_args()


# Collate function to combine individual samples into a batch.
#
# Steps:
# 1. Extract pixel_values from each sample and stack into a single tensor
# 2. Extract labels from each sample and convert to a long tensor
# 3. Return a dictionary containing the batched data
#
# Args:
#     batch: List of dictionaries, each containing 'pixel_values' and 'labels'
#
# Returns:
#     Dictionary with batched 'pixel_values' and 'labels' tensors
def collate_fn(batch: list[dict[str, torch.Tensor]]) -> dict[str, torch.Tensor]:
    # Stack all image tensors into shape [batch_size, channels, height, width]
    pixel_values = torch.stack([item["pixel_values"] for item in batch])
    
    # Combine all labels into a 1D tensor of shape [batch_size]
    labels = torch.tensor([item["labels"] for item in batch], dtype=torch.long)
    
    return {"pixel_values": pixel_values, "labels": labels}


# Create DataLoader objects for training and validation datasets.
#
# Steps:
# 1. Initialize training dataset from the 'train' split
# 2. Initialize validation dataset from the 'val' split
# 3. Create training DataLoader with shuffling enabled
# 4. Create validation DataLoader without shuffling
#
# Args:
#     args: Parsed command-line arguments
#
# Returns:
#     Tuple of (train_loader, val_loader)
def build_dataloaders(args: argparse.Namespace) -> tuple[DataLoader, DataLoader]:
    # Step 1: Load training dataset
    # This dataset will load images from data_dir/train/ and apply preprocessing
    train_dataset = AiImageDataset(data_dir=args.data_dir, split="train", model_name=MODEL_NAME)
    
    # Step 2: Load validation dataset
    # This dataset will load images from data_dir/val/ for evaluation
    val_dataset = AiImageDataset(data_dir=args.data_dir, split="val", model_name=MODEL_NAME)

    # Step 3: Create training DataLoader
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,        # Number of images per batch
        shuffle=True,                       # Randomize order each epoch to prevent overfitting
        num_workers=args.num_workers,      # Parallel workers for data loading
        pin_memory=torch.cuda.is_available(),  # Speed up GPU transfer if CUDA available
        collate_fn=collate_fn,             # Custom function to batch samples
    )
    
    # Step 4: Create validation DataLoader
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,        # Same batch size as training
        shuffle=False,                      # Don't shuffle validation data (not necessary)
        num_workers=args.num_workers,      # Parallel workers for data loading
        pin_memory=torch.cuda.is_available(),  # Speed up GPU transfer if CUDA available
        collate_fn=collate_fn,             # Custom function to batch samples
    )
    return train_loader, val_loader


# Build and configure the ViT model for transfer learning.
#
# Steps:
# 1. Load pre-trained ViT model from HuggingFace
# 2. Freeze all base model parameters (prevent updating during training)
# 3. Unfreeze only the classifier head parameters (allow fine-tuning)
# 4. Move model to the appropriate device (GPU or CPU)
#
# This approach uses transfer learning: we keep the pre-trained feature extractor
# frozen and only train the final classification layer for our specific task.
#
# Args:
#     device: torch.device indicating where to run the model (cuda or cpu)
#
# Returns:
#     Configured model ready for training
def build_model(device: torch.device) -> AutoModelForImageClassification:
    # Step 1: Load pre-trained ViT model with custom classification head
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME,                        # Pre-trained ViT-Large model
        num_labels=2,                      # Binary classification (Real vs Fake)
        id2label=ID_TO_LABEL,              # Map 0->Real, 1->Fake
        label2id=LABEL_TO_ID,              # Map Real->0, Fake->1
        ignore_mismatched_sizes=True,      # Allow replacing classification head
    )

    # Step 2: Freeze all parameters in the entire model
    # This prevents the pre-trained weights from being updated
    for parameter in model.parameters():
        parameter.requires_grad = False

    # Step 3: Unfreeze only the classifier head parameters
    # This allows only the final layer to be trained on our specific task
    for parameter in model.classifier.parameters():
        parameter.requires_grad = True

    # Step 4: Move model to GPU (if available) or CPU
    model.to(device)
    return model


# Calculate performance metrics for an entire epoch.
#
# Steps:
# 1. Concatenate all batch logits and labels into single arrays
# 2. Convert logits to probabilities using softmax
# 3. Get predictions by taking the class with highest probability
# 4. Calculate accuracy (% correct predictions)
# 5. Calculate F1 score (harmonic mean of precision and recall)
# 6. Calculate AUC (area under ROC curve, measures class separation)
#
# Args:
#     logits: List of raw model outputs from each batch
#     labels: List of true labels from each batch
#
# Returns:
#     Dictionary containing accuracy, f1, and auc metrics
def compute_epoch_metrics(logits: list[np.ndarray], labels: list[np.ndarray]) -> dict[str, float]:
    # Step 1: Combine all batches into single arrays
    logits_array = np.concatenate(logits, axis=0)      # Shape: [total_samples, 2]
    labels_array = np.concatenate(labels, axis=0)      # Shape: [total_samples]
    
    # Step 2: Convert raw logits to probabilities using softmax
    # Softmax ensures probabilities sum to 1.0 for each sample
    probabilities = torch.softmax(torch.from_numpy(logits_array), dim=-1).numpy()
    
    # Step 3: Get predicted class (0 or 1) by taking argmax
    predictions = probabilities.argmax(axis=1)

    # Step 4-5: Calculate classification metrics
    metrics = {
        "accuracy": accuracy_score(labels_array, predictions),  # % of correct predictions
        "f1": f1_score(labels_array, predictions, zero_division=0),  # Balance of precision/recall
    }

    # Step 6: Calculate AUC (Area Under ROC Curve)
    # AUC measures how well the model separates the two classes
    # Uses probability of positive class (index 1)
    try:
        metrics["auc"] = roc_auc_score(labels_array, probabilities[:, 1])
    except ValueError:
        # AUC can fail if only one class is present in the batch
        metrics["auc"] = float("nan")
    return metrics


def run_phase(
    model: AutoModelForImageClassification,
    loader: DataLoader,
    optimizer: AdamW,
    device: torch.device,
    train: bool,
) -> dict[str, float]:
    """
    Execute one complete pass through the dataset (either training or validation).
    
    Steps:
    1. Set model to training or evaluation mode
    2. Initialize tracking variables for loss and predictions
    3. Loop through all batches in the dataset:
       a. Move data to the appropriate device (GPU/CPU)
       b. Forward pass: compute model predictions and loss
       c. If training: backward pass to compute gradients and update weights
       d. Accumulate loss and predictions for metrics
    4. Compute epoch-level metrics (accuracy, F1, AUC)
    5. Calculate average loss across all samples
    
    Args:
        model: The ViT model to train/evaluate
        loader: DataLoader providing batches of data
        optimizer: AdamW optimizer for updating weights
        device: Where to run computations (cuda or cpu)
        train: True for training mode, False for validation mode
    
    Returns:
        Dictionary of metrics including loss, accuracy, f1, and auc
    """
    # Step 1: Set model mode
    # Training mode enables dropout/batch norm, eval mode disables them
    model.train(mode=train)
    
    # Step 2: Initialize accumulators
    total_loss = 0.0                      # Sum of all batch losses
    all_logits: list[np.ndarray] = []     # Store predictions from all batches
    all_labels: list[np.ndarray] = []     # Store true labels from all batches

    # Step 3: Process each batch
    for batch in loader:
        # Step 3a: Move batch data to GPU/CPU
        pixel_values = batch["pixel_values"].to(device)  # Image tensors
        labels = batch["labels"].to(device)              # Ground truth labels

        # Step 3b: Forward pass through the model
        # Enable gradient computation only during training
        with torch.set_grad_enabled(train):
            # Get model outputs (logits and loss)
            outputs = model(pixel_values=pixel_values, labels=labels)
            loss = outputs.loss

            # Step 3c: Backward pass and optimization (only during training)
            if train:
                # Clear gradients from previous iteration
                optimizer.zero_grad(set_to_none=True)
                
                # Compute gradients via backpropagation
                loss.backward()
                
                # Update model weights based on gradients
                optimizer.step()

        # Step 3d: Accumulate results for metric calculation
        # Multiply loss by batch size to get total loss (not mean)
        total_loss += loss.item() * labels.size(0)
        
        # Store predictions and labels (move to CPU and convert to numpy)
        all_logits.append(outputs.logits.detach().cpu().numpy())
        all_labels.append(labels.detach().cpu().numpy())

    # Step 4: Calculate metrics across all batches
    metrics = compute_epoch_metrics(all_logits, all_labels)
    
    # Step 5: Calculate average loss per sample
    metrics["loss"] = total_loss / len(loader.dataset)
    
    return metrics


def save_artifacts(model: AutoModelForImageClassification, output_dir: Path, history: list[dict[str, float]]) -> None:
    """
    Save the trained model and training history to disk.
    
    Steps:
    1. Create output directory if it doesn't exist
    2. Save the model weights and configuration
    3. Save training history (metrics from each epoch) as JSON
    
    Args:
        model: Trained model to save
        output_dir: Directory where artifacts will be saved
        history: List of dictionaries containing metrics from each epoch
    """
    # Step 1: Create output directory (and any parent directories)
    # exist_ok=True prevents errors if directory already exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Step 2: Save model using HuggingFace's save format
    # This saves: model weights, config.json, and other necessary files
    model.save_pretrained(output_dir)

    # Step 3: Save training history as a JSON file
    history_path = output_dir / "history.json"
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")


def main() -> None:
    """
    Main training pipeline orchestrating the entire process.
    
    Steps:
    1. Parse command-line arguments
    2. Determine device (GPU if available, otherwise CPU)
    3. Build data loaders for training and validation
    4. Build and configure the model
    5. Initialize optimizer (only for trainable parameters)
    6. Training loop: for each epoch
       a. Run training phase on training data
       b. Run evaluation phase on validation data
       c. Record and display metrics
    7. Save the trained model and training history
    """
    # Step 1: Parse command-line arguments for configuration
    args = parse_args()
    
    # Step 2: Determine which device to use for training
    # CUDA (GPU) is preferred for faster training, fallback to CPU if unavailable
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Step 3: Build DataLoaders for efficient batch processing
    train_loader, val_loader = build_dataloaders(args)
    
    # Step 4: Build the model with frozen base and trainable classifier
    model = build_model(device)
    
    # Step 5: Initialize AdamW optimizer
    # Only optimize parameters where requires_grad=True (i.e., the classifier head)
    # AdamW is Adam with weight decay regularization to prevent overfitting
    optimizer = AdamW(filter(lambda parameter: parameter.requires_grad, model.parameters()), lr=args.learning_rate)

    # Initialize list to store metrics from each epoch
    history: list[dict[str, float]] = []

    # Step 6: Training loop - iterate through epochs
    for epoch in range(1, args.epochs + 1):
        # Step 6a: Training phase
        # Process all training batches, update weights, compute metrics
        train_metrics = run_phase(model, train_loader, optimizer, device, train=True)
        
        # Step 6b: Validation phase
        # Evaluate on validation set without updating weights
        val_metrics = run_phase(model, val_loader, optimizer, device, train=False)

        # Step 6c: Record metrics for this epoch
        # Combine epoch number with all training and validation metrics
        epoch_metrics = {
            "epoch": epoch,
            **{f"train_{key}": value for key, value in train_metrics.items()},
            **{f"val_{key}": value for key, value in val_metrics.items()},
        }
        history.append(epoch_metrics)

        # Display progress with all metrics formatted to 4 decimal places
        print(
            " | ".join(
                [
                    f"epoch={epoch}",
                    f"train_loss={train_metrics['loss']:.4f}",
                    f"train_acc={train_metrics['accuracy']:.4f}",
                    f"train_f1={train_metrics['f1']:.4f}",
                    f"train_auc={train_metrics['auc']:.4f}",
                    f"val_loss={val_metrics['loss']:.4f}",
                    f"val_acc={val_metrics['accuracy']:.4f}",
                    f"val_f1={val_metrics['f1']:.4f}",
                    f"val_auc={val_metrics['auc']:.4f}",
                ]
            )
        )

    # Step 7: Save the trained model and metrics history
    save_artifacts(model, args.output_dir, history)


if __name__ == "__main__":
    main()
