# ML — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive — the root file's ML/Architecture section still applies.

## Rules

- Target model size: ≤ 10 MB (typically ~5-7 MB with transfer learning)
- Training: PyTorch MobileNetV3-Small with progressive unfreezing. Dual export: ONNX (web) + Core ML (iOS)
- Inference: client-side via onnxruntime-web (Phase 4.0c), on-device via Core ML on iOS (Phase 2.0)
- Training scripts must be idempotent and reproducible
- ESLint `preserve-caught-error` rule: when re-throwing a new Error from a catch block, always attach `{ cause: err }`
- Training data lives in `ML_TRAINING_DATA_PATH` (external, private data repo), model output in `models/` (gitignored, stored in private data repo)
- Labels are flattened with `__` delimiter: `franchise__item-slug` (single-level directories required)
- Python dependencies managed by `uv` + `pyproject.toml`; run `uv sync` after clone
- Model artifacts (`.pt`, `.onnx`, `.mlpackage`, JSON) are NOT tracked in git — they live in the private data repo
- ONNX export produces `.onnx` graph + `.onnx.data` weights sidecar — both files required for inference. The graph references the sidecar by filename (e.g., `primary-classifier-20260331-c117-a83.8.onnx.data`)

## Training Data Source

- ML training uses seed images organized by category — `catalog/` is excluded (product gallery only)
- Training tiers: `training-primary`, `training-secondary`, `training-package`, `training-accessories`
- Test tiers: `test-primary`, `test-secondary`, `test-package`, `test-accessories`
- `--category` flag filters to a single tier (e.g., `--category primary` → `training-primary/` only)
- Without `--category`, all training tiers are merged per item
- Two input modes (mutually exclusive):
  - `npm run prepare-data -- --manifest <path>` — reads API export manifest JSON
  - `npm run prepare-data -- --source-dir <path>` — scans seed-images directory tree directly
- Seed-images structure: `{sourceDir}/{tier}/{franchise}/{manufacturer}/{item}/{images}`
- `_unmatched/` directories are skipped at any level
- User collection photos (private, RLS-protected) are NOT used for training
- `prepare-data` scans training tiers; `prepare-test-data` (or `--test-set` flag) scans test tiers only (no augmentation)
- Default output: `ML_TRAINING_DATA_PATH` env for training, `ML_TEST_DATA_PATH` env for test sets

## Phase 4.0 Pipeline

- **4.0a Training Data Prep:** ✅ Export script, data augmentation, class balance analysis, category-based tier system
- **4.0b Model Training:** ✅ PyTorch MobileNetV3-Small with transfer learning, progressive unfreezing, dual ONNX + Core ML export
- **4.0c-1 Model Metadata API:** ✅ `GET /ml/models` endpoint + static file serving via `@fastify/static` (dev) / CDN (prod)
- **4.0c-2 Client-Side Inference:** ✅ "Add by Photo" on collection page, onnxruntime-web, IndexedDB caching, top-5 predictions with inline add-to-collection
- **4.0c-T ML Telemetry:** ✅ `ml_inference_events` table, `POST /ml/events`, admin dashboard at `/admin/ml` with recharts
- **4.0c-4 E2E Tests + Quality Dashboard:** ✅ 15 Playwright E2E tests, model quality metrics on admin dashboard (per-class accuracy chart, confused pairs table, quality gate badges)
- **4.0c-3 Server-Side Fallback:** Optional `POST /ml/classify` via onnxruntime-node (not needed for current scale)
- **4.0d Retraining Docs:** ✅ End-to-end pipeline, retraining triggers, quality gates checklist, deployment/rollback, data versioning
- Model versioning: auto-generated filenames with training date, class count, accuracy metric
- Python environment: `pyproject.toml` + `uv` for dependency management; `uv sync` to install

## Before Writing New Code

Read existing files for patterns before writing anything new:

- New training script → read `TRAINING.md` for pipeline conventions
- New iOS ML integration → read existing VNCoreMLRequest usage in `ios/track-em-toys/` (when iOS app is created)
- Model evaluation → check `models/` for existing evaluation outputs

---

## Pre-Submission Checklist

Before reporting any task complete, run these verifications and fix all failures.

### 1. Model file size

```bash
du -sh models/*.mlpackage models/*.onnx 2>/dev/null || echo "No model files yet"
```

Each model must be ≤ 10 MB.

### 2. No hardcoded absolute paths in scripts

```bash
grep -rn "/Users/\|/home/\|C:\\\\" . --include="*.ts" --include="*.py" --include="*.swift" --include="*.sh"
```

Must return zero results. Use relative paths or environment variables.

### 3. Training data directory structure

```bash
ls "$ML_TRAINING_DATA_PATH"
```

Each class must be a subdirectory containing only image files. Labels use `franchise__item-slug` format.

### 4. No credentials in training scripts

```bash
grep -rn "api_key\|secret\|password\|token" . --include="*.ts" --include="*.py" --include="*.swift" --include="*.sh" -i
```

Must return zero results. Use environment variables for external service credentials.

### 5. Tests and lint

```bash
cd ml && npm test           # TypeScript tests + ESLint
cd ml && npm run test:python # Python tests (pytest)
```

All tests must pass with zero failures. ESLint must have zero warnings.

### 6. TypeScript build

```bash
cd ml && npm run typecheck
```

Must complete with zero TypeScript errors.

### 7. iOS integration compiles

If you modified any Swift files that integrate the Core ML model:

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "error:|warning:" | head -20
```

Must return zero errors.

### 8. Training script documentation

Any new training script must include a comment block explaining: what model it trains, expected input format, expected output (model name, location), and approximate training time.

---

## Key Patterns

### VNCoreMLRequest integration

```swift
func classifyToy(image: CVPixelBuffer) async throws -> String {
    let model = try MLModel(contentsOf: modelURL)
    let vnModel = try VNCoreMLModel(for: model)
    return try await withCheckedThrowingContinuation { continuation in
        let request = VNCoreMLRequest(model: vnModel) { request, error in
            if let error { continuation.resume(throwing: error); return }
            guard let result = request.results?.first as? VNClassificationObservation else {
                continuation.resume(throwing: ClassificationError.noResults)
                return
            }
            continuation.resume(returning: result.identifier)
        }
        let handler = VNImageRequestHandler(cvPixelBuffer: image)
        do {
            try handler.perform([request])
        } catch {
            continuation.resume(throwing: error)
        }
    }
}
```

### Training data organization

```
ML_TRAINING_DATA_PATH/{category}/
  transformers__optimus-prime/
    {photoId}-original.webp
    aug-0-hflip.webp
    aug-1-rotate-cw.webp
  transformers__bumblebee/
    {photoId}-original.webp
```

Labels use `__` delimiter (not `/`) for single-level directories.
Each subdirectory name becomes a class label in the trained model.
Two separate models: primary (robot mode) and secondary (alt-mode/vehicle).

### Build Commands

```bash
cd ml && npm install           # Install Node.js dependencies (sharp, tsx, typescript)
cd ml && uv sync               # Install Python dependencies (torch, coremltools, etc.)
cd ml && npm run prepare-data -- --manifest <path>     # Prepare from API manifest
cd ml && npm run prepare-data -- --source-dir <path>   # Prepare from seed-images directory
cd ml && npm run prepare-data -- --source-dir <path> --category primary  # Single category
cd ml && npm run prepare-test-data -- --source-dir <path>               # Prepare held-out test set (no augmentation)
cd ml && npm run train -- --category primary                    # Train PyTorch model
cd ml && npm run export-model -- --checkpoint models/<ckpt>.pt  # Export ONNX + Core ML
cd ml && npm run validate-model -- --onnx-model models/<m>.onnx --coreml-model models/<m>.mlpackage --category primary
cd ml && npm test              # Run tests + lint (TypeScript)
cd ml && npm run test:python   # Run Python tests (pytest)
cd ml && npm run typecheck     # TypeScript check only
cd ml && npm run lint          # ESLint only
cd ml && npm run format        # Prettier format
cd ml && npm run format:check  # Prettier check (CI mode)
```

### Augmentation

- Transforms are deterministic (no randomness) — same input (manifest or source-dir) + target produces identical output
- Adaptive: classes with fewer originals get more augmentation to reach the target count
- Compound transforms: flip+rotate, flip+brightness, etc. for diversity
- Clean-on-rerun: class directories are wiped before repopulating to prevent orphans
- Minimum 10 images per class enforced by validation (Create ML requirement)
