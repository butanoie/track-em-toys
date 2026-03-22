# ML Training Data Preparation Pipeline

**Date:** 2026-03-22
**Time:** 04:19:21 UTC
**Type:** Feature
**Phase:** 4.0a
**Issue:** #93

## Summary

Implemented the ML training data preparation pipeline in the `ml/` module. The pipeline reads manifest JSON files from the ML export endpoint, copies photos into Create ML's folder-per-class structure, applies adaptive augmentation to reach a target count per class, and validates the output. This is Phase 4.0a of the ML roadmap, bridging the existing photo catalog with Create ML model training.

---

## Changes Implemented

### 1. ML Module Setup

Established `ml/` as a standalone Node.js/TypeScript project with its own `package.json`, `tsconfig.json`, `eslint.config.js`, and `vitest.config.ts` — all mirroring the API module's conventions.

**Created:**

- `ml/package.json` — Dependencies: sharp. DevDeps: TypeScript, Vitest, ESLint, tsx, dotenv
- `ml/tsconfig.json` — ES2022, Node16, strict mode, noUncheckedIndexedAccess
- `ml/eslint.config.js` — Same rules as API minus Fastify/DB-specific rules
- `ml/vitest.config.ts` — 80% coverage thresholds
- `ml/.env.example` — Documents `ML_TRAINING_DATA_PATH`

### 2. Training Data Pipeline (7 modules)

**Created:**

- `ml/src/types.ts` — Shared interfaces (Manifest, CliOptions, ClassBalance, BalanceReport, AugmentedImage, CopyResult, ValidationResult)
- `ml/src/manifest.ts` — `readManifest()`, `groupEntriesByLabel()`, `flattenLabel()` (franchise/item → franchise__item)
- `ml/src/balance.ts` — `analyzeBalance()`, `printBalanceReport()` with viability warnings
- `ml/src/transforms.ts` — 15 transforms via 4 builder functions: hflip, rotation(±10°), brightness(±20%), and compound combinations
- `ml/src/augment.ts` — `augmentClass()` with deterministic transform cycling and per-file error handling
- `ml/src/copy.ts` — `copyClass()` with clean-on-rerun, `cleanClassDir()`, `prepareOutputDir()`
- `ml/src/validate.ts` — `validateOutputStructure()` checking Create ML format, minimum 10 images/class, unexpected dirs
- `ml/src/prepare-training-data.ts` — CLI entry point with arg parsing, batch processing, summary output

### 3. Test Suite

**Created:**

- `ml/src/manifest.test.ts` — 9 tests: parsing, validation, grouping, label flattening
- `ml/src/balance.test.ts` — 7 tests: augment counts, min/max/mean, viability warnings
- `ml/src/transforms.test.ts` — 32 tests: each transform produces valid WebP and JPEG, determinism
- `ml/src/augment.test.ts` — 8 tests: count, distribution, deterministic filenames, missing source handling
- `ml/src/copy.test.ts` — 7 tests: copy originals, write augmented, clean mode, no-clean mode, errors
- `ml/src/validate.test.ts` — 7 tests: valid structure, empty dirs, low count, missing dirs, unexpected dirs, .DS_Store

### 4. Documentation & Config Updates

**Created:**

- `docs/decisions/ADR_ML_Training_Data_Preparation.md` — Architecture decision record
- `docs/test-scenarios/UNIT_ML_TRAINING_DATA.md` — Gherkin test scenarios

**Modified:**

- `ml/CLAUDE.md` — Updated with build commands, augmentation conventions, label flattening rule, TypeScript pre-submission checks
- `api/.env.example` — Added `ML_TRAINING_DATA_PATH` documentation
- `.gitignore` — Added `ml/.env`, `ml/training-data/**/*.webp`
- `docs/test-scenarios/README.md` — Added UNIT_ML_TRAINING_DATA entry

---

## Technical Details

### Label Flattening

Create ML's `MLImageClassifier` with `.labeledDirectories(at:)` only supports single-level directory nesting. The manifest's `franchise_slug/item_slug` labels (e.g., `transformers/commander-stack`) are flattened to `transformers__commander-stack` using `__` as an unambiguous delimiter (slugs only contain hyphens).

### Adaptive Augmentation

The pipeline sets a target count per class (default 100) and generates `max(0, target - originals)` augmented images. Transform selection cycles deterministically: `source = entries[i % entries.length], transform = TRANSFORMS[i % TRANSFORMS.length]`. No randomness — same input always produces identical output.

### Rotation with Center-Crop

To avoid black corner artifacts, rotation transforms compute the expanded canvas dimensions after rotation, then extract the largest centered rectangle at the inscribed dimensions. Background fill is white for any edge cases.

### CLI Interface

```bash
cd ml && npm run prepare-data -- --manifest <path> [options]

Options:
  --output <path>         Override ML_TRAINING_DATA_PATH
  --target-count <n>      Images per class (default: 100)
  --format webp|jpeg      Output format (default: webp)
  --classes <a,b,c>       Filter to specific labels
  --no-clean              Skip directory cleaning
```

---

## Validation & Testing

- 78 unit tests passing across 6 test files
- ESLint: 0 errors, 0 warnings
- TypeScript: 0 errors (strict mode + noUncheckedIndexedAccess)
- Prettier: all files formatted
- API and Web modules: all checks still passing (658 + 592 tests)
- No hardcoded absolute paths
- No credentials in source code

---

## Impact Assessment

- Establishes `ml/` as an active code module with its own test/lint/build infrastructure
- Creates the data pipeline needed before Phase 4.0b (model training) can begin
- Two test classes ready: Commander Stack (18 photos) and Margh (19 photos)
- Training data output goes to the private `track-em-toys-data` repo, not this repo

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Source files created | 8 |
| Test files created | 6 |
| Config files created | 5 |
| Doc files created/modified | 5 |
| Unit tests | 78 |
| Augmentation transforms | 15 |

---

## Status

✅ COMPLETE
