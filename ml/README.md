# Track'em Toys ML

On-device toy image classification using Core ML and Create ML with transfer learning. Models are trained offline and bundled into the iOS/macOS app for inference — no server-side ML.

## Status

Phase 4.0a (Training Data Preparation) is implemented. The pipeline supports two input modes: API manifest export and direct directory scanning of seed images. Model training (Phase 4.0b) is next.

## Directory Structure

```
ml/
├── src/
│   ├── prepare-training-data.ts  # CLI entry point (5-step pipeline)
│   ├── scan.ts                   # Directory scanner for seed images
│   ├── manifest.ts               # Manifest JSON parser + label utilities
│   ├── balance.ts                # Class balance analysis and reporting
│   ├── transforms.ts             # 15 deterministic augmentation transforms
│   ├── augment.ts                # Adaptive augmentation orchestrator
│   ├── copy.ts                   # File copy with idempotency + clean-on-rerun
│   ├── validate.ts               # Output validation (Create ML format)
│   ├── types.ts                  # Shared interfaces
│   └── *.test.ts                 # Companion tests for each module
├── models/                       # Trained .mlmodel output files
└── CLAUDE.md                     # Agent rules for this module
```

## Training Data Preparation

Two mutually exclusive input modes, with category filtering and test set support:

```bash
# From API manifest (exported by POST /catalog/ml-export)
npm run prepare-data -- --manifest <path>

# From seed-images directory (all training tiers)
npm run prepare-data -- --source-dir <path>

# Prepare a single category (e.g., primary model only)
npm run prepare-data -- --source-dir <path> --category primary

# Prepare held-out test set (test tiers only, no augmentation)
npm run prepare-test-data -- --source-dir <path>
npm run prepare-test-data -- --source-dir <path> --category primary
```

### Seed Images Directory Structure

```
{source-dir}/
  catalog/                          # Product gallery DB only — excluded from ML training
    {franchise}/{manufacturer}/{item-slug}/
  training-primary/                 # Primary product photos (robot mode, hero shots)
    {franchise}/{manufacturer}/{item-slug}/
  training-secondary/               # Alternate views (alt-mode, vehicle, back angles)
    {franchise}/{manufacturer}/{item-slug}/
  training-package/                 # Packaging photos (optional)
    {franchise}/{manufacturer}/{item-slug}/
  training-accessories/             # Accessory close-ups (optional)
    {franchise}/{manufacturer}/{item-slug}/
  test-primary/                     # Held-out test set for primary model
    {franchise}/{manufacturer}/{item-slug}/
  test-secondary/                   # Held-out test set for secondary model
    {franchise}/{manufacturer}/{item-slug}/
  _unmatched/                       # Ignored by tooling
```

Without `--category`, all training tiers are merged per item. With `--category primary`, only `training-primary/` is scanned. Test tiers (`test-primary/`, `test-secondary/`, etc.) are scanned via `--test-set` and are never augmented.

The output is a flat folder-per-class structure for Create ML:

```
ML_TRAINING_DATA_PATH/{category}/
  {franchise}__{item-slug}/
    image-1.jpeg                    # Original
    aug-0-hflip.webp               # Augmented
    aug-1-rotate-cw.webp
```

### Common Options

```bash
--output <path>         # Output directory (default: ML_TRAINING_DATA_PATH or ML_TEST_DATA_PATH env)
--target-count <n>      # Target images per class (default: 100)
--format webp|jpeg      # Output image format (default: webp)
--classes <a,b,c>       # Only process specific labels (comma-separated)
--category <name>       # Filter to a single category (primary|secondary|package|accessories)
--no-clean              # Skip cleaning class directories before writing
--test-set              # Scan test tiers only, copy without augmentation
```

## Constraints

- **Model size:** 10 MB maximum (typically ~7 MB with transfer learning)
- **Inference:** On-device only via Core ML — no server-side ML calls
- **Training scripts:** Must be idempotent, use relative paths only, contain no credentials
- **Training data:** Follows Create ML's `<class-name>/<images>` folder format
- **Minimum images:** 10 per class (enforced by validation)
- **Labels:** Use `__` delimiter (e.g., `transformers__ft-04-scoria`) — Create ML requires single-level directories

## Build Commands

```bash
npm install           # Install dependencies (sharp, tsx, typescript)
npm test              # Run tests + lint
npm run typecheck     # TypeScript check only
npm run lint          # ESLint only
npm run format        # Prettier format
npm run format:check  # Prettier check (CI mode)
```

## Integration

Trained models are integrated into the iOS app via `VNCoreMLRequest`. See the iOS module's ML integration patterns in [`ios/CLAUDE.md`](../ios/CLAUDE.md).
