"""
Model:    Exports trained MobileNetV3-Small checkpoint to ONNX and Core ML
Input:    .pt checkpoint from train.py + sibling metrics JSON (auto-located)
Output:   {output-dir}/{stem}.onnx
          {output-dir}/{stem}.mlmodel
          {output-dir}/{stem}-metadata.json
Time:     ~30s on any device (export is CPU-bound graph tracing)
Note:     Requires macOS for Core ML export (coremltools dependency)
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import coremltools as ct
import onnx
import torch

from common import (
    INPUT_SIZE,
    build_model,
    find_metrics_json,
    generate_model_stem,
    load_checkpoint,
    save_metadata_json,
)

MAX_MODEL_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export a trained checkpoint to ONNX and Core ML formats"
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        required=True,
        help="Path to .pt checkpoint from train.py",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory (default: same directory as checkpoint)",
    )
    return parser.parse_args()


def export_onnx(model: torch.nn.Module, output_path: Path) -> None:
    """Export model to ONNX format.

    Forces CPU for export to avoid MPS operator compatibility issues.
    """
    model = model.cpu()
    model.eval()

    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}},
    )

    # Structural validation
    onnx_model = onnx.load(str(output_path))
    onnx.checker.check_model(onnx_model)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"  ONNX:     {output_path} ({size_mb:.1f} MB)")


def export_coreml(onnx_path: Path, output_path: Path) -> None:
    """Convert ONNX model to Core ML format."""
    mlmodel = ct.converters.convert(
        str(onnx_path),
        source="onnx",
        minimum_deployment_target=ct.target.iOS16,
    )

    mlmodel.short_description = "Toy image classifier (MobileNetV3-Small)"
    mlmodel.author = "Track'em Toys ML Pipeline"
    mlmodel.save(str(output_path))

    size_bytes = output_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)
    print(f"  Core ML:  {output_path} ({size_mb:.1f} MB)")

    if size_bytes > MAX_MODEL_SIZE_BYTES:
        print(
            f"  WARNING: Core ML model exceeds "
            f"{MAX_MODEL_SIZE_BYTES // (1024 * 1024)} MB limit "
            f"({size_mb:.1f} MB). Consider quantization."
        )


def main() -> None:
    args = parse_args()
    ckpt_path = Path(args.checkpoint)
    output_dir = Path(args.output_dir) if args.output_dir else ckpt_path.parent

    print("ML Export -- ONNX + Core ML")
    print("=" * 60)

    # Load checkpoint
    ckpt = load_checkpoint(ckpt_path)
    num_classes = len(ckpt["class_to_idx"])
    category = ckpt["category"]
    best_val_acc = ckpt["best_val_acc"]

    print(f"Checkpoint: {ckpt_path}")
    print(f"Category:   {category}")
    print(f"Classes:    {num_classes}")
    print(f"Val acc:    {best_val_acc:.1%}")

    # Load metrics
    metrics_path = find_metrics_json(ckpt_path)
    with open(metrics_path) as f:
        metrics = json.load(f)

    # Rebuild model and load weights
    model = build_model(num_classes)
    model.load_state_dict(ckpt["model_state_dict"])

    # Reuse stem from training metrics to maintain traceability across days
    stem = metrics.get("model_stem") or generate_model_stem(
        category, num_classes, best_val_acc * 100
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    # Export ONNX
    print("\nExporting...")
    onnx_path = output_dir / f"{stem}.onnx"
    export_onnx(model, onnx_path)

    # Export Core ML from ONNX
    mlmodel_path = output_dir / f"{stem}.mlmodel"
    export_coreml(onnx_path, mlmodel_path)

    # Write metadata JSON for the web client
    metadata = {
        "name": f"{category}-classifier",
        "version": stem,
        "category": category,
        "format": "onnx",
        "class_count": num_classes,
        "accuracy": best_val_acc,
        "input_shape": [1, 3, INPUT_SIZE, INPUT_SIZE],
        "input_names": ["input"],
        "output_names": ["output"],
        "label_map": metrics["label_map"],
        "label_hierarchy": metrics["label_hierarchy"],
        "trained_at": ckpt.get("trained_at", ""),
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }

    metadata_path = output_dir / f"{stem}-metadata.json"
    save_metadata_json(metadata_path, metadata)
    print(f"  Metadata: {metadata_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
