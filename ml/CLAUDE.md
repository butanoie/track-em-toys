# ML — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive — the root file's ML/Architecture section still applies.

## Rules

- Target model size: ≤ 10 MB (typically ~7 MB with transfer learning). Monitor with `du -sh models/*.mlmodel`.
- All inference runs on-device via Core ML — no server-side ML calls
- Training scripts must be idempotent and reproducible
- ESLint `preserve-caught-error` rule: when re-throwing a new Error from a catch block, always attach `{ cause: err }`
- Training data lives in `ML_TRAINING_DATA_PATH` (external, private data repo), model output in `models/`
- Labels are flattened with `__` delimiter: `franchise__item-slug` (Create ML requires single-level directories)

## Training Data Source

- ML training uses **catalog photos** from the `item_photos` table (shared, app-managed reference images)
- Catalog photos are NOT user-private PII — no consent mechanism needed
- Training data export: `npm run prepare-data -- --manifest <path>` reads API manifest, copies photos into `ClassName/` folders at `ML_TRAINING_DATA_PATH`
- User collection photos (private, RLS-protected) are NOT used for training

## Phase 4.0 Pipeline (planned)

- **4.0a Training Data Prep:** Export script, data augmentation (rotation, scale, brightness), class balance analysis
- **4.0b Model Training:** Create ML Image Classification with transfer learning, ~7 MB target, ~80% accuracy with 80+ images/class
- **4.0c Model Serving:** Metadata API (`GET /ml/models`), optional server-side inference (`POST /ml/classify`), or ONNX for web
- **4.0d Retraining:** Documented workflow (export → train → evaluate → deploy), quality gates (minimum accuracy threshold)
- Model versioning: naming convention includes training date, class count, accuracy metric

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
du -sh models/*.mlmodel 2>/dev/null || echo "No .mlmodel files yet"
```

Each model must be ≤ 10 MB.

### 2. No hardcoded absolute paths in scripts

```bash
grep -rn "/Users/\|/home/\|C:\\\\" . --include="*.ts" --include="*.py" --include="*.swift" --include="*.sh"
```

Must return zero results. Use relative paths or environment variables.

### 3. Training data directory structure

```bash
ls training-data/
```

Each class must be a subdirectory containing only image files, matching Create ML's `<class-name>/<images>` format.

### 4. No credentials in training scripts

```bash
grep -rn "api_key\|secret\|password\|token" . --include="*.ts" --include="*.py" --include="*.swift" --include="*.sh" -i
```

Must return zero results. Use environment variables for external service credentials.

### 5. Tests and lint

```bash
cd ml && npm test
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
ML_TRAINING_DATA_PATH/
  transformers__optimus-prime/
    {photoId}-original.webp
    aug-0-hflip.webp
    aug-1-rotate-cw.webp
  transformers__bumblebee/
    {photoId}-original.webp
```

Labels use `__` delimiter (not `/`) because Create ML requires single-level directories.
Each subdirectory name becomes a class label in the trained model.

### Build Commands

```bash
cd ml && npm install           # Install dependencies (sharp, tsx, typescript)
cd ml && npm run prepare-data -- --manifest <path>  # Prepare training data
cd ml && npm test              # Run tests + lint
cd ml && npm run typecheck     # TypeScript check only
cd ml && npm run lint          # ESLint only
cd ml && npm run format        # Prettier format
cd ml && npm run format:check  # Prettier check (CI mode)
```

### Augmentation

- Transforms are deterministic (no randomness) — same manifest + target produces identical output
- Adaptive: classes with fewer originals get more augmentation to reach the target count
- Compound transforms: flip+rotate, flip+brightness, etc. for diversity
- Clean-on-rerun: class directories are wiped before repopulating to prevent orphans
- Minimum 10 images per class enforced by validation (Create ML requirement)
