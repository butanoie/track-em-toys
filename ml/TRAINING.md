# ML Training Pipeline Conventions

## Overview

Training pipeline for toy image classification models using PyTorch MobileNetV3-Small with transfer learning. Dual export to ONNX (web inference via onnxruntime-web) and Core ML (iOS inference).

## Directory Structure

```
ml/
  scripts/             # Python training/export/validation scripts
    train.py           # PyTorch training with progressive unfreezing
    export.py          # Dual ONNX + Core ML export
    validate.py        # Cross-format agreement + accuracy gates
    common.py          # Shared utilities (transforms, label maps)
  src/                 # Node.js data preparation pipeline (TypeScript)
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
- Training data uses `franchise__item-slug` label format (single-level directories, `__` delimiter)
- Target model size: ≤ 10 MB (typically ~5-7 MB with transfer learning)
- No credentials or API keys in scripts — use environment variables
- Client-side inference via onnxruntime-web (web) and Core ML (iOS) — no server-side ML calls required

## Evaluation

- Log accuracy metrics to stdout during training
- Save confusion matrix and per-class accuracy alongside the model (`*-metrics.json`)

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

---

## End-to-End Retraining Pipeline

### Full Pipeline Steps

```
1. Prepare data    →  npm run prepare-data -- --source-dir <path> --category primary
2. Train model     →  npm run train -- --category primary
3. Export model    →  npm run export-model -- --checkpoint models/<ckpt>.pt
4. Validate model  →  npm run validate-model -- --onnx-model models/<m>.onnx --coreml-model models/<m>.mlpackage --category primary
5. Deploy model    →  Copy model files to ML_MODELS_PATH, verify via GET /ml/models
```

Each step is idempotent and can be re-run independently.

### Retraining Triggers

Retrain when any of the following occur:

| Trigger                                | How to detect                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **New franchise or category added**    | New class directories appear in seed-images that don't exist in the current model's label map               |
| **Photo count doubles for a category** | Compare `prepare-data` output count against the `data_dir` recorded in the current model's `*-metrics.json` |
| **Accuracy drops on new test photos**  | Run `validate-model` against a refreshed test set — if accuracy drops below the gate threshold, retrain     |
| **Significant new seed data batch**    | After adding 50+ new images across multiple classes                                                         |
| **Model architecture change**          | Switching backbone, input size, or training hyperparameters                                                 |

There is no automated trigger — retraining is manual. Run the full pipeline when a trigger condition is met.

### Quality Gates Checklist

Before deploying a new model, verify all gates pass:

- [ ] **Minimum accuracy**: ONNX accuracy ≥ 70% on held-out test set (default `--min-accuracy 0.70`)
- [ ] **Cross-format agreement**: ONNX and Core ML predictions agree ≥ 95% (default `--min-agreement 0.95`)
- [ ] **Core ML accuracy**: Core ML accuracy ≥ 70% (same threshold as ONNX)
- [ ] **Per-class review**: Check `*-metrics.json` for classes with < 50% accuracy — these need more training data
- [ ] **Confusion matrix review**: Check `*-metrics.json` for commonly confused class pairs — may indicate labeling issues
- [ ] **Model size**: Each exported model ≤ 10 MB (`du -sh models/*.onnx models/*.onnx.data models/*.mlpackage`)
- [ ] **Class coverage**: All expected classes present in the model's label map (compare against seed-images directories)

The `validate-model` script enforces the first three gates automatically (exits with code 1 on failure). The remaining gates require manual review of the metrics JSON.

```bash
# Run automated gates
npm run validate-model -- \
  --onnx-model models/<model>.onnx \
  --coreml-model models/<model>.mlpackage \
  --category primary \
  --min-accuracy 0.70 \
  --min-agreement 0.95

# Review per-class accuracy (manual)
cat models/<model>-metrics.json | python3 -c "
import json, sys
m = json.load(sys.stdin)
for cls, acc in sorted(m['per_class_accuracy'].items(), key=lambda x: x[1]):
    flag = ' ⚠️' if acc < 0.5 else ''
    print(f'  {acc:5.1%}  {cls}{flag}')
"
```

### Deployment

After all quality gates pass, deploy the model files:

```bash
# 1. Copy model files to the API's model directory
cp models/<stem>.onnx "$ML_MODELS_PATH/"
cp models/<stem>.onnx.data "$ML_MODELS_PATH/"
cp models/<stem>-metadata.json "$ML_MODELS_PATH/"
cp models/<stem>.mlpackage "$ML_MODELS_PATH/"  # for future iOS serving

# 2. Verify the API discovers the new model
curl -s https://localhost:3010/ml/models -H "Authorization: Bearer <token>" | jq '.models[].name'

# 3. Client cache invalidation is automatic
#    - Web: model version in metadata changes → IndexedDB cache miss → auto-download
#    - The old model files can be removed after confirming the new model loads
```

In production, model files would be uploaded to a CDN and `ML_MODELS_BASE_URL` pointed at the CDN origin. The `GET /ml/models` response includes `download_url` and `metadata_url` constructed from this base URL.

### Rollback Procedure

If a deployed model causes issues (low real-world accuracy, crashes, etc.):

```bash
# 1. Remove the bad model files
rm "$ML_MODELS_PATH/<new-stem>.onnx"
rm "$ML_MODELS_PATH/<new-stem>.onnx.data"
rm "$ML_MODELS_PATH/<new-stem>-metadata.json"

# 2. Restore the previous model files (from private data repo or backup)
cp <backup-path>/<old-stem>.onnx "$ML_MODELS_PATH/"
cp <backup-path>/<old-stem>.onnx.data "$ML_MODELS_PATH/"
cp <backup-path>/<old-stem>-metadata.json "$ML_MODELS_PATH/"

# 3. Verify rollback via API
curl -s https://localhost:3010/ml/models -H "Authorization: Bearer <token>" | jq '.models[].version'

# 4. Client rollback is automatic
#    - Version mismatch triggers re-download from the restored model
#    - No user action required — next classification loads the previous model
```

The API auto-discovers models by scanning `ML_MODELS_PATH` for `*-metadata.json` files on each `GET /ml/models` request. No restart is needed.

### Data Versioning

Each training run is traceable through the following artifacts:

| Artifact                  | What it records                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model filename**        | `{category}-classifier-{YYYYMMDD}-c{N}-a{acc}` — training date, class count, best validation accuracy                                                         |
| **`*-metrics.json`**      | `data_dir` (path to training data used), `trained_at` (ISO timestamp), `hyperparams` (lr, epochs, batch_size, etc.), `seed` (random seed for reproducibility) |
| **`*-metadata.json`**     | `label_map` (index → class name mapping), `class_count`, `accuracy`, `exported_at`                                                                            |
| **Seed data git history** | Private data repo tracks which photos were added/changed per commit                                                                                           |
| **Prepare-data output**   | `prepare-data` logs the source directory and augmentation counts to stdout                                                                                    |

To reproduce a training run: check out the seed data repo at the commit that matches the training date, use the same `data_dir` path, and run `train.py` with the `hyperparams` from the metrics JSON and `--seed 42`.

### CI/Automation Recommendations (Future)

Currently the pipeline is fully manual. For future automation:

1. **GitHub Actions workflow**: Trigger on pushes to the private seed data repo. Run `prepare-data → train → export → validate` and post metrics as a PR comment.
2. **Model registry**: Store model artifacts in GitHub Releases or an S3 bucket with version tags, rather than copying files manually.
3. **Automated test-set evaluation**: On each PR that adds new seed images, run `validate-model` against the current production model to detect accuracy regressions before merging.
4. **Scheduled retraining**: Weekly or monthly cron job that checks if retraining triggers are met and kicks off the pipeline if so.

None of these are required for the current workflow — the manual pipeline is sufficient for the current scale.
