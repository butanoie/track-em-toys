"""
Model:    Cross-validates ONNX and Core ML model outputs against the held-out test set
Input:    .onnx and .mlpackage files + test data directory (folder-per-class, no augmentation)
Output:   Per-model accuracy report to stdout; exits 1 if agreement < threshold or accuracy < min
Time:     ~2 min per 1000 images (CPU onnxruntime + coremltools prediction)
Note:     Requires macOS for Core ML inference (coremltools dependency)
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

import numpy as np
import onnxruntime as ort
import torch
from torchvision.datasets import ImageFolder

from common import (
    INPUT_SIZE,
    get_transforms,
    positive_float,
)

# coremltools is macOS-only; import conditionally
try:
    import coremltools as ct

    HAS_COREML = True
except ImportError:
    HAS_COREML = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate ONNX and Core ML models against a held-out test set"
    )
    parser.add_argument(
        "--onnx-model", type=str, required=True, help="Path to .onnx model"
    )
    parser.add_argument(
        "--coreml-model",
        type=str,
        default=None,
        help="Path to .mlpackage (optional, macOS only)",
    )
    parser.add_argument(
        "--test-data-dir",
        type=str,
        default=None,
        help="Path to test data (default: ML_TEST_DATA_PATH/{category})",
    )
    parser.add_argument(
        "--metadata",
        type=str,
        default=None,
        help="Path to metadata JSON (default: auto-located from ONNX model path)",
    )
    parser.add_argument(
        "--category",
        type=str,
        default=None,
        help="Category (for env var fallback, auto-detected from metadata if available)",
    )
    parser.add_argument(
        "--min-accuracy",
        type=positive_float,
        default=0.70,
        help="Minimum accuracy gate as a fraction in (0, 1] (default: 0.70 = 70%%)",
    )
    parser.add_argument(
        "--min-agreement",
        type=positive_float,
        default=0.95,
        help="Minimum ONNX/Core ML agreement as a fraction in (0, 1] (default: 0.95)",
    )
    args = parser.parse_args()

    for flag_name in ("min_accuracy", "min_agreement"):
        value = getattr(args, flag_name)
        if value > 1.0:
            print(
                f"Error: --{flag_name.replace('_', '-')} must be a fraction in (0, 1], "
                f"got {value}. Did you mean {value / 100:.2f}?"
            )
            raise SystemExit(1)

    return args


def resolve_test_data_dir(args: argparse.Namespace, category: str | None) -> Path:
    """Resolve test data directory from CLI arg or environment variable."""
    if args.test_data_dir:
        return Path(args.test_data_dir)

    effective_category = args.category or category
    env_path = os.environ.get("ML_TEST_DATA_PATH")
    if env_path and effective_category:
        return Path(env_path) / effective_category

    print(
        "Error: --test-data-dir is required "
        "(or set ML_TEST_DATA_PATH env var with --category)"
    )
    raise SystemExit(1)


def run_onnx_inference(
    model_path: Path, dataset: ImageFolder, train_label_map: dict[int, str] | None
) -> list[str]:
    """Run inference using ONNX Runtime. Returns list of predicted class names."""
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    predictions = []
    for img_tensor, _ in dataset:
        input_array = img_tensor.unsqueeze(0).numpy()
        outputs = session.run(None, {input_name: input_array})
        pred_idx = int(np.argmax(outputs[0], axis=1)[0])
        if train_label_map:
            predictions.append(train_label_map.get(pred_idx, f"unknown-{pred_idx}"))
        else:
            predictions.append(dataset.classes[pred_idx])

    return predictions


def run_coreml_inference(
    model_path: Path, dataset: ImageFolder, train_label_map: dict[int, str] | None
) -> list[str]:
    """Run inference using Core ML. Returns list of predicted class names."""
    if not HAS_COREML:
        print("Error: coremltools not available (requires macOS)")
        raise SystemExit(1)

    mlmodel = ct.models.MLModel(str(model_path))

    # Discover input/output names from the model spec
    spec = mlmodel.get_spec()
    input_name = spec.description.input[0].name
    output_name = spec.description.output[0].name

    predictions = []
    for img_tensor, _ in dataset:
        input_array = img_tensor.unsqueeze(0).numpy()
        result = mlmodel.predict({input_name: input_array})
        output_array = result[output_name]
        pred_idx = int(np.argmax(output_array, axis=1)[0])
        if train_label_map:
            predictions.append(train_label_map.get(pred_idx, f"unknown-{pred_idx}"))
        else:
            predictions.append(dataset.classes[pred_idx])

    return predictions


def compute_accuracy(
    predictions: list[str], ground_truth: list[str]
) -> float:
    """Compute top-1 accuracy by class name."""
    correct = sum(p == g for p, g in zip(predictions, ground_truth))
    return correct / len(ground_truth) if ground_truth else 0.0


def main() -> None:
    args = parse_args()
    onnx_path = Path(args.onnx_model)

    print("ML Validate -- Cross-Format Agreement")
    print("=" * 60)

    # Load metadata if available
    category = args.category
    if args.metadata:
        metadata_path = Path(args.metadata)
    else:
        # Auto-locate from ONNX model path: stem-metadata.json
        stem = onnx_path.stem
        metadata_path = onnx_path.with_name(f"{stem}-metadata.json")

    if metadata_path.is_file():
        with open(metadata_path) as f:
            metadata = json.load(f)
        if not category:
            category = metadata.get("category")
        print(f"Metadata:   {metadata_path}")
    else:
        metadata = None
        print(f"Metadata:   not found (looked at {metadata_path})")

    # Resolve test data directory
    test_data_dir = resolve_test_data_dir(args, category)

    print(f"ONNX:       {onnx_path}")
    if args.coreml_model:
        print(f"Core ML:    {args.coreml_model}")
    print(f"Test data:  {test_data_dir}")
    print(f"Min acc:    {args.min_accuracy:.0%}")
    if args.coreml_model:
        print(f"Min agree:  {args.min_agreement:.0%}")

    # Load test dataset
    dataset = ImageFolder(str(test_data_dir), transform=get_transforms(training=False))
    if len(dataset) == 0:
        print(f"Error: no images found in {test_data_dir}")
        raise SystemExit(2)

    # Ground truth as class names (not indices) so we can compare across different label maps
    ground_truth = [dataset.classes[label] for _, label in dataset.samples]
    num_classes = len(dataset.classes)
    print(f"\nTest set:   {len(dataset)} images, {num_classes} classes")

    # Build training label map from metadata (maps model output index → class name)
    train_label_map: dict[int, str] | None = None
    if metadata and "label_map" in metadata:
        train_label_map = {int(k): v for k, v in metadata["label_map"].items()}
        print(f"Model:      {len(train_label_map)} classes in training label map")

    # Run ONNX inference
    print("\nRunning ONNX inference...")
    onnx_preds = run_onnx_inference(onnx_path, dataset, train_label_map)
    onnx_acc = compute_accuracy(onnx_preds, ground_truth)
    print(f"  ONNX accuracy: {onnx_acc:.1%}")

    # Run Core ML inference if model provided
    coreml_preds = None
    coreml_acc = None
    agreement = None

    if args.coreml_model:
        coreml_path = Path(args.coreml_model)
        print("\nRunning Core ML inference...")
        coreml_preds = run_coreml_inference(coreml_path, dataset, train_label_map)
        coreml_acc = compute_accuracy(coreml_preds, ground_truth)
        print(f"  Core ML accuracy: {coreml_acc:.1%}")

        # Compute agreement
        agree_count = sum(
            o == c for o, c in zip(onnx_preds, coreml_preds)
        )
        agreement = agree_count / len(onnx_preds)
        print(f"\n  Agreement: {agreement:.1%} ({agree_count}/{len(onnx_preds)})")

        # Report disagreements
        disagree_indices = [
            i for i, (o, c) in enumerate(zip(onnx_preds, coreml_preds)) if o != c
        ]
        if disagree_indices:
            print(f"\n  Disagreements ({len(disagree_indices)}):")
            for idx in disagree_indices[:20]:
                img_path = dataset.samples[idx][0]
                print(
                    f"    {img_path}: true={ground_truth[idx]} "
                    f"onnx={onnx_preds[idx]} coreml={coreml_preds[idx]}"
                )
            if len(disagree_indices) > 20:
                print(f"    ... and {len(disagree_indices) - 20} more")

    # Quality gates
    print("\n" + "-" * 60)
    passed = True

    if onnx_acc < args.min_accuracy:
        print(f"FAIL: ONNX accuracy {onnx_acc:.1%} < {args.min_accuracy:.0%}")
        passed = False
    else:
        print(f"PASS: ONNX accuracy {onnx_acc:.1%} >= {args.min_accuracy:.0%}")

    if coreml_acc is not None:
        if coreml_acc < args.min_accuracy:
            print(
                f"FAIL: Core ML accuracy {coreml_acc:.1%} < {args.min_accuracy:.0%}"
            )
            passed = False
        else:
            print(
                f"PASS: Core ML accuracy {coreml_acc:.1%} >= {args.min_accuracy:.0%}"
            )

    if agreement is not None:
        if agreement < args.min_agreement:
            print(
                f"FAIL: Agreement {agreement:.1%} < {args.min_agreement:.0%}"
            )
            passed = False
        else:
            print(f"PASS: Agreement {agreement:.1%} >= {args.min_agreement:.0%}")

    if not passed:
        raise SystemExit(1)

    print("\nAll gates passed.")


if __name__ == "__main__":
    main()
