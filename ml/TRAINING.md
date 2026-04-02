# ML Training Pipeline Conventions

## Overview

Training pipeline for toy image classification models using Create ML with transfer learning.

## Directory Structure

```
ml/
  training-data/       # Labeled image folders (one per class)
    optimus-prime/
    bumblebee/
    ...
  models/              # Trained model output files (gitignored, stored in private data repo)
  TRAINING.md          # This file
  CLAUDE.md            # Agent rules
```

## Training Script Requirements

Every training script must include a header comment documenting:

- **Model name**: What the trained model will be called
- **Input format**: Expected image dimensions, color space, folder structure
- **Output**: Model filename and output directory (`models/`)
- **Approximate training time**: Rough estimate on typical hardware

## Pipeline Rules

- Scripts must be idempotent — running twice produces the same output
- Use relative paths only (no `/Users/...` or `/home/...`)
- Training data follows Create ML's `<class-name>/<images>` folder format
- Target model size: ≤ 10 MB (typically ~7 MB with transfer learning)
- No credentials or API keys in scripts — use environment variables
- All inference runs on-device via Core ML — no server-side ML calls

## Evaluation

- Log accuracy metrics to stdout during training
- Save confusion matrix or evaluation summary alongside the model when possible

## PyTorch Training Workflow

### Prerequisites

Install [uv](https://docs.astral.sh/uv/):

```bash
brew install uv
cd ml && uv sync
```

### Training

```bash
# Prepare training data (Node.js pipeline -- unchanged)
npm run prepare-data -- --source-dir <seed-images-path> --category primary

# Train model
npm run train -- --category primary
npm run train -- --category primary --epochs 25 --lr 0.001 --batch-size 32

# Export to ONNX + Core ML
npm run export-model -- --checkpoint models/<checkpoint>.pt

# Validate cross-format agreement on held-out test set
npm run validate-model -- --onnx-model models/<model>.onnx --coreml-model models/<model>.mlpackage --category primary
```

### Two-Phase Training

Training uses progressive unfreezing:

1. **Phase 1** (first 1/3 epochs): Base MobileNetV3 layers frozen, only classifier head trains
2. **Phase 2** (remaining epochs): Last 3 InvertedResidual blocks unfrozen, learning rate reduced 10x

This prevents overfitting with small datasets while allowing the model to adapt features.

### Validation Split

Training data is split 80/20 (stratified, seed=42) into train and validation sets. The held-out test set (`ML_TEST_DATA_PATH`) is only used by `validate.py` for unbiased final evaluation.

### Model Output

Training produces:

- `{category}-classifier-{date}-c{N}-a{acc}.pt` -- best checkpoint by validation accuracy
- `{category}-classifier-{date}-c{N}-a{acc}-metrics.json` -- per-class accuracy, confusion matrix, hyperparams

Export produces:

- `{stem}.onnx` -- ONNX graph for web inference (onnxruntime-web)
- `{stem}.onnx.data` -- weights sidecar (both `.onnx` + `.onnx.data` are required for inference)
- `{stem}.mlpackage` -- for iOS inference (Core ML)
- `{stem}-metadata.json` -- label map, input shape, accuracy for the web client
