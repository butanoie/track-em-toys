"""Shared utilities for the ML training pipeline.

Provides device detection, image transforms, model construction, label parsing,
checkpoint I/O, and metadata serialization used by train.py, export.py, and validate.py.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models, transforms


# --- Device detection ---


def get_device() -> torch.device:
    """Auto-detect best available device: MPS > CUDA > CPU."""
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


# --- Image transforms ---

# ImageNet normalization constants
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
INPUT_SIZE = 224


def get_transforms(training: bool) -> transforms.Compose:
    """Build image transform pipeline.

    Args:
        training: If True, includes random augmentation (flip, color jitter).
                  If False, deterministic resize + center crop only.
    """
    if training:
        return transforms.Compose([
            transforms.RandomResizedCrop(INPUT_SIZE),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ])
    return transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])


# --- Model construction ---


def build_model(num_classes: int) -> nn.Module:
    """Construct MobileNetV3-Small with a replaced classifier head.

    Uses pretrained ImageNet weights. The classifier head is replaced with a
    new Linear layer matching num_classes.
    """
    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = models.mobilenet_v3_small(weights=weights)

    # MobileNetV3-Small classifier: Sequential(Linear(576, 1024), Hardswish, Dropout, Linear(1024, 1000))
    # Replace the final Linear layer to match our class count
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)

    return model


def freeze_base(model: nn.Module) -> None:
    """Freeze all parameters except the classifier head."""
    for param in model.features.parameters():
        param.requires_grad = False


def unfreeze_last_blocks(model: nn.Module, n_blocks: int = 3) -> None:
    """Unfreeze the last N InvertedResidual blocks in the feature extractor."""
    for param in model.features[-n_blocks:].parameters():
        param.requires_grad = True


# --- Label utilities ---


def parse_label(flat_label: str) -> dict[str, str]:
    """Parse a flat label into franchise and item components.

    Args:
        flat_label: e.g. "transformers__optimus-prime"

    Returns:
        {"franchise": "transformers", "item": "optimus-prime"}
    """
    if "__" in flat_label:
        parts = flat_label.split("__", 1)
        return {"franchise": parts[0], "item": parts[1]}
    return {"franchise": "", "item": flat_label}


def build_label_map(class_to_idx: dict[str, int]) -> dict:
    """Build label map and hierarchy from ImageFolder's class_to_idx.

    Returns:
        {
            "label_map": {0: "transformers__optimus-prime", ...},
            "label_hierarchy": {0: {"franchise": "transformers", "item": "optimus-prime"}, ...}
        }
    """
    label_map = {idx: label for label, idx in class_to_idx.items()}
    label_hierarchy = {idx: parse_label(label) for label, idx in class_to_idx.items()}
    return {"label_map": label_map, "label_hierarchy": label_hierarchy}


def validate_class_dirs(data_dir: Path) -> list[str]:
    """Validate that data_dir contains flat class directories with __ delimiter.

    Returns list of class directory names. Exits with code 2 if invalid.
    """
    if not data_dir.is_dir():
        print(f"Error: data directory does not exist: {data_dir}")
        raise SystemExit(2)

    class_dirs = sorted(
        d.name for d in data_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

    if not class_dirs:
        print(f"Error: no class directories found in {data_dir}")
        raise SystemExit(2)

    valid_dirs = [d for d in class_dirs if "__" in d]
    if not valid_dirs:
        print(
            f"Error: no class directories with '__' delimiter found in {data_dir}\n"
            f"Expected format: franchise__item-slug/\n"
            f"Found: {', '.join(class_dirs[:5])}"
        )
        raise SystemExit(2)

    invalid_dirs = [d for d in class_dirs if "__" not in d]
    if invalid_dirs:
        print(
            f"Warning: {len(invalid_dirs)} directories lack '__' delimiter "
            f"and will be treated as classes: {', '.join(invalid_dirs[:5])}"
        )

    return class_dirs


# --- Checkpoint I/O ---


def save_checkpoint(path: Path, state: dict) -> None:
    """Atomically save a checkpoint: write to temp file then rename."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    os.close(fd)
    try:
        torch.save(state, tmp_path)
        os.replace(tmp_path, path)
    except BaseException:
        os.unlink(tmp_path)
        raise


def load_checkpoint(path: Path) -> dict:
    """Load and validate a checkpoint dict."""
    if not path.is_file():
        print(f"Error: checkpoint not found: {path}")
        raise SystemExit(1)

    state = torch.load(path, map_location="cpu", weights_only=True)

    required_keys = {"model_state_dict", "class_to_idx", "best_val_acc", "category"}
    missing = required_keys - set(state.keys())
    if missing:
        print(f"Error: checkpoint missing keys: {missing}")
        raise SystemExit(1)

    return state


# --- Metadata ---


def generate_model_stem(category: str, class_count: int, accuracy: float) -> str:
    """Generate a model filename stem from training metadata.

    Returns e.g. "primary-classifier-20260330-c45-a84.3"
    """
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    acc_str = f"{accuracy:.1f}"
    return f"{category}-classifier-{date_str}-c{class_count}-a{acc_str}"


def save_metadata_json(path: Path, metadata: dict) -> None:
    """Write metadata JSON with consistent formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metadata, indent=2, default=str) + "\n")


def find_metrics_json(checkpoint_path: Path) -> Path:
    """Locate the sibling metrics JSON for a checkpoint.

    Expects: checkpoint.pt -> checkpoint-metrics.json
    """
    stem = checkpoint_path.stem
    metrics_path = checkpoint_path.with_name(f"{stem}-metrics.json")
    if not metrics_path.is_file():
        print(f"Error: metrics JSON not found: {metrics_path}")
        raise SystemExit(1)
    return metrics_path


# --- CLI helpers ---


def positive_int(value: str) -> int:
    """argparse type for positive integers."""
    ivalue = int(value)
    if ivalue < 1:
        raise argparse.ArgumentTypeError(f"{value} must be a positive integer")
    return ivalue


def positive_float(value: str) -> float:
    """argparse type for positive floats."""
    fvalue = float(value)
    if fvalue <= 0:
        raise argparse.ArgumentTypeError(f"{value} must be a positive number")
    return fvalue
