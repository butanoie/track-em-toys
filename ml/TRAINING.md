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
  models/              # Trained .mlmodel output files
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
