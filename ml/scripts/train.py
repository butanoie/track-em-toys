"""
Model:    MobileNetV3-Small image classifier (toy identification)
Input:    Folder-per-class at --data-dir: {dir}/{franchise__item-slug}/*.{webp,jpg,jpeg,png}
          Images resized on-the-fly to 224x224, normalized to ImageNet mean/std
Output:   {output-dir}/{category}-classifier-{date}-c{N}-a{acc}.pt  (best checkpoint)
          {output-dir}/{category}-classifier-{date}-c{N}-a{acc}-metrics.json
Time:     ~5 min on Apple M-series (MPS), ~15 min CPU, ~2 min CUDA -- 25 epochs, 200 classes
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Subset
from torchvision.datasets import ImageFolder

from common import (
    build_label_map,
    build_model,
    freeze_base,
    generate_model_stem,
    get_device,
    get_transforms,
    load_checkpoint,
    positive_float,
    positive_int,
    save_checkpoint,
    save_metadata_json,
    unfreeze_last_blocks,
    validate_class_dirs,
)

SEED = 42
VAL_SPLIT = 0.2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a MobileNetV3-Small toy image classifier"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Path to folder-per-class training data (default: ML_TRAINING_DATA_PATH/{category})",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="models",
        help="Directory for checkpoint and metrics output (default: models/)",
    )
    parser.add_argument(
        "--category",
        type=str,
        required=True,
        choices=["primary", "secondary", "package", "accessories"],
        help="Image category to train (determines model name and default data dir)",
    )
    parser.add_argument("--epochs", type=positive_int, default=25)
    parser.add_argument("--lr", type=positive_float, default=0.001)
    parser.add_argument("--batch-size", type=positive_int, default=32)
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="Path to checkpoint to resume training from",
    )
    return parser.parse_args()


def resolve_data_dir(args: argparse.Namespace) -> Path:
    """Resolve training data directory from CLI arg or environment variable."""
    if args.data_dir:
        return Path(args.data_dir)

    env_path = os.environ.get("ML_TRAINING_DATA_PATH")
    if env_path:
        return Path(env_path) / args.category

    print("Error: --data-dir is required (or set ML_TRAINING_DATA_PATH env var)")
    raise SystemExit(1)


def build_data_loaders(
    data_dir: Path, batch_size: int, device: torch.device
) -> tuple[DataLoader, DataLoader, ImageFolder]:
    """Load dataset and create stratified train/val split."""
    dataset = ImageFolder(str(data_dir), transform=get_transforms(training=True))
    val_dataset = ImageFolder(str(data_dir), transform=get_transforms(training=False))

    if len(dataset) == 0:
        print(f"Error: no images found in {data_dir}")
        raise SystemExit(2)

    targets = [s[1] for s in dataset.samples]
    indices = list(range(len(dataset)))

    train_idx, val_idx = train_test_split(
        indices, test_size=VAL_SPLIT, stratify=targets, random_state=SEED
    )

    train_subset = Subset(dataset, train_idx)
    val_subset = Subset(val_dataset, val_idx)

    # num_workers=0 on MPS for fork stability, 4 on CUDA
    num_workers = 4 if device.type == "cuda" else 0

    train_loader = DataLoader(
        train_subset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=device.type in ("cuda", "mps"),
    )
    val_loader = DataLoader(
        val_subset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=device.type in ("cuda", "mps"),
    )

    return train_loader, val_loader, dataset


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, float]:
    """Train for one epoch. Returns (accuracy, loss)."""
    model.train()
    correct = 0
    total = 0
    running_loss = 0.0

    for inputs, labels in loader:
        inputs, labels = inputs.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * inputs.size(0)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

    return correct / total, running_loss / total


@torch.no_grad()
def validate_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, float]:
    """Validate for one epoch. Returns (accuracy, loss)."""
    model.eval()
    correct = 0
    total = 0
    running_loss = 0.0

    for inputs, labels in loader:
        inputs, labels = inputs.to(device), labels.to(device)

        outputs = model(inputs)
        loss = criterion(outputs, labels)

        running_loss += loss.item() * inputs.size(0)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

    return correct / total, running_loss / total


@torch.no_grad()
def compute_per_class_accuracy(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    num_classes: int,
) -> tuple[dict[int, float], list[list[int]]]:
    """Compute per-class accuracy and confusion matrix on the validation set."""
    model.eval()
    class_correct = [0] * num_classes
    class_total = [0] * num_classes
    confusion = [[0] * num_classes for _ in range(num_classes)]

    for inputs, labels in loader:
        inputs, labels = inputs.to(device), labels.to(device)
        outputs = model(inputs)
        _, predicted = outputs.max(1)

        for label, pred in zip(labels, predicted):
            l_idx, p_idx = label.item(), pred.item()
            class_total[l_idx] += 1
            confusion[l_idx][p_idx] += 1
            if l_idx == p_idx:
                class_correct[l_idx] += 1

    per_class = {
        i: class_correct[i] / class_total[i] if class_total[i] > 0 else 0.0
        for i in range(num_classes)
    }

    return per_class, confusion


def main() -> None:
    args = parse_args()
    data_dir = resolve_data_dir(args)
    output_dir = Path(args.output_dir)

    print("ML Training -- MobileNetV3-Small")
    print("=" * 60)

    # Validate data directory structure
    validate_class_dirs(data_dir)

    device = get_device()
    print(f"Device:     {device}")
    print(f"Data:       {data_dir}")
    print(f"Category:   {args.category}")
    print(f"Epochs:     {args.epochs}")
    print(f"LR:         {args.lr}")
    print(f"Batch size: {args.batch_size}")

    # Load data
    print("\nLoading dataset...")
    train_loader, val_loader, dataset = build_data_loaders(
        data_dir, args.batch_size, device
    )
    num_classes = len(dataset.classes)
    print(f"Classes:    {num_classes}")
    print(f"Train:      {len(train_loader.dataset)} images")
    print(f"Val:        {len(val_loader.dataset)} images")

    # Build model
    model = build_model(num_classes)
    freeze_base(model)
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr,
        weight_decay=1e-4,
    )

    # Resume from checkpoint if requested
    start_epoch = 0
    best_val_acc = 0.0
    freeze_epochs = max(1, args.epochs // 3)

    if args.resume:
        ckpt = load_checkpoint(Path(args.resume))
        ckpt_classes = set(ckpt["class_to_idx"].keys())
        current_classes = set(dataset.class_to_idx.keys())
        if ckpt_classes != current_classes:
            print(
                f"Error: checkpoint class labels do not match dataset -- cannot resume\n"
                f"  In checkpoint only: {ckpt_classes - current_classes}\n"
                f"  In dataset only:    {current_classes - ckpt_classes}"
            )
            raise SystemExit(1)
        model.load_state_dict(ckpt["model_state_dict"])
        if "optimizer_state_dict" in ckpt:
            optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        best_val_acc = ckpt.get("best_val_acc", 0.0)
        print(f"Resumed from epoch {start_epoch}, best val acc: {best_val_acc:.1%}")

    # Training loop
    print(f"\nPhase 1: Frozen base (epochs 1-{freeze_epochs})")
    print(f"Phase 2: Unfrozen last blocks (epochs {freeze_epochs + 1}-{args.epochs})")
    print("-" * 60)

    best_ckpt_state = None

    for epoch in range(start_epoch, args.epochs):
        # Phase transition: unfreeze last blocks and rebuild optimizer
        if epoch == freeze_epochs:
            unfreeze_last_blocks(model)
            unfrozen_lr = args.lr * 0.1
            optimizer = torch.optim.AdamW(
                filter(lambda p: p.requires_grad, model.parameters()),
                lr=unfrozen_lr,
                weight_decay=1e-4,
            )
            print(f"  >> Unfroze last blocks, lr reduced to {unfrozen_lr:.5f}")

        train_acc, train_loss = train_one_epoch(
            model, train_loader, optimizer, criterion, device
        )
        val_acc, val_loss = validate_one_epoch(
            model, val_loader, criterion, device
        )

        marker = ""
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_ckpt_state = {
                "epoch": epoch,
                "model_state_dict": {
                    k: v.cpu() for k, v in model.state_dict().items()
                },
                "optimizer_state_dict": optimizer.state_dict(),
                "class_to_idx": dataset.class_to_idx,
                "best_val_acc": best_val_acc,
                "category": args.category,
                "hyperparams": {
                    "epochs": args.epochs,
                    "lr": args.lr,
                    "batch_size": args.batch_size,
                },
                "seed": SEED,
                "trained_at": "",  # set at save time
            }
            marker = " *"

        print(
            f"  Epoch {epoch + 1:>3}/{args.epochs}  "
            f"train_loss={train_loss:.4f}  train_acc={train_acc:.1%}  "
            f"val_loss={val_loss:.4f}  val_acc={val_acc:.1%}{marker}"
        )

    if best_ckpt_state is None:
        print("Error: no improvement during training -- no checkpoint saved")
        raise SystemExit(2)

    # Save best checkpoint
    best_ckpt_state["trained_at"] = datetime.now(timezone.utc).isoformat()

    stem = generate_model_stem(args.category, num_classes, best_val_acc * 100)
    ckpt_path = output_dir / f"{stem}.pt"
    save_checkpoint(ckpt_path, best_ckpt_state)
    print(f"\nCheckpoint: {ckpt_path}")

    # Compute per-class accuracy and confusion matrix on val set
    model.load_state_dict(best_ckpt_state["model_state_dict"])
    model = model.to(device)
    per_class_acc, confusion = compute_per_class_accuracy(
        model, val_loader, device, num_classes
    )

    label_maps = build_label_map(dataset.class_to_idx)

    metrics = {
        "model_stem": stem,
        "category": args.category,
        "class_count": num_classes,
        "best_val_accuracy": best_val_acc,
        "label_map": label_maps["label_map"],
        "label_hierarchy": label_maps["label_hierarchy"],
        "per_class_accuracy": {
            label_maps["label_map"][idx]: acc for idx, acc in per_class_acc.items()
        },
        "confusion_matrix": confusion,
        "hyperparams": best_ckpt_state["hyperparams"],
        "seed": SEED,
        "trained_at": best_ckpt_state["trained_at"],
        "data_dir": str(data_dir),
    }

    metrics_path = output_dir / f"{stem}-metrics.json"
    save_metadata_json(metrics_path, metrics)
    print(f"Metrics:    {metrics_path}")
    print(f"\nBest val accuracy: {best_val_acc:.1%}")
    print("Done.")


if __name__ == "__main__":
    main()
