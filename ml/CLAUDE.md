# ML — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive — the root file's ML/Architecture section still applies.

## Rules

- Target model size: ≤ 10 MB (typically ~7 MB with transfer learning). Monitor with `du -sh models/*.mlmodel`.
- All inference runs on-device via Core ML — no server-side ML calls
- Training scripts must be idempotent and reproducible
- Training data lives in `training-data/` (labeled folders), model output in `models/`

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
grep -rn "/Users/\|/home/\|C:\\\\" . --include="*.py" --include="*.swift" --include="*.sh"
```

Must return zero results. Use relative paths or environment variables.

### 3. Training data directory structure

```bash
ls training-data/
```

Each class must be a subdirectory containing only image files, matching Create ML's `<class-name>/<images>` format.

### 4. No credentials in training scripts

```bash
grep -rn "api_key\|secret\|password\|token" . --include="*.py" --include="*.swift" --include="*.sh" -i
```

Must return zero results. Use environment variables for external service credentials.

### 5. iOS integration compiles

If you modified any Swift files that integrate the Core ML model:

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "error:|warning:" | head -20
```

Must return zero errors.

### 6. Training script documentation

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
training-data/
  optimus-prime/
    img001.jpg
    img002.jpg
  bumblebee/
    img001.jpg
```

Each subdirectory name becomes a class label in the trained model.
