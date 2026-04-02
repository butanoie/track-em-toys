# ML Web Inference Plan — Phase 4.0b/4.0c

## Problem

Prototype Core ML image classification models (primary: robot mode, secondary: alt-mode/vehicle) are trained via Create ML. The web app needs to use these models so users can photograph a toy and identify matching catalog items. User preference: client-side inference wherever possible.

## Key Finding: Core ML → ONNX Conversion is Unreliable

`onnxmltools.convert_coreml()` is in maintenance mode, has silent FP16 precision issues, and Create ML's opaque internal architecture doesn't always map cleanly to ONNX operators. The solution is to invert the dependency: train in PyTorch, export natively to both ONNX (web) and Core ML (iOS).

## Decision: Client-Side Inference + PyTorch Training

### Training: PyTorch replaces Create ML

Train with PyTorch (MobileNetV3-Small transfer learning), export to **both** formats from one checkpoint:

- `torch.onnx.export()` → ONNX for web (first-class, no lossy conversion)
- `coremltools.convert()` → Core ML for iOS (well-maintained path)

The existing `ml/src/` Node.js pipeline (scan, augment, copy, validate) is unchanged — PyTorch consumes the same Create ML folder-per-class output structure.

```
Previous:  Create ML (.mlmodel) --[fragile conversion]--> ONNX (.onnx) --> browser
New:       PyTorch (.pt)        --[torch.onnx.export]---> ONNX (.onnx) --> browser
           PyTorch (.pt)        --[torch.jit.trace + ct.convert]--> Core ML (.mlpackage) --> iOS
```

New files:

- `ml/scripts/common.py` — shared utilities (device detection, transforms, model builder, label parsing)
- `ml/scripts/train.py` — MobileNetV3-Small fine-tuning with progressive unfreezing
- `ml/scripts/export.py` — dual ONNX + Core ML export from checkpoint
- `ml/scripts/validate.py` — cross-format equivalence check (top-1 agreement ≥99%)
- `ml/pyproject.toml` — Python dependencies managed by `uv`
- `ml/scripts/tests/` — pytest unit and integration tests

### Training Architecture (Phase 4.0b Detail)

- **Model**: MobileNetV3-Small, pretrained ImageNet weights, classifier head replaced for N classes
- **Progressive unfreezing**: Phase 1 (first 1/3 epochs) freezes base, trains head only. Phase 2 unfreezes last blocks, reduces lr by 10x.
- **Optimizer**: AdamW (lr=0.001, weight_decay=1e-4)
- **Validation**: Stratified 80/20 split from training data (seed=42). Test set fully held out.
- **Checkpoint**: Saves best epoch by validation accuracy. Supports `--resume`.
- **Transforms**: On-the-fly Resize(256) → CenterCrop(224) → Normalize(ImageNet). Training adds RandomHorizontalFlip + ColorJitter.
- **DataLoader**: `num_workers=0` on MPS (fork stability), `4` on CUDA
- **Export**: ONNX opset 17 + Core ML (converted from ONNX). Size gate: assert ≤ 10 MB.
- **Filename**: Auto-generated `{category}-classifier-{date}-c{classCount}-a{accuracy}.{ext}`
- **Python env**: `pyproject.toml` + `uv` (lockfile committed for reproducibility)
- **macOS-only**: export.py and validate.py require coremltools (macOS)

### Inference: Client-Side via onnxruntime-web

- **Primary model loaded on demand** when user navigates to `/classify`
- **Cached in IndexedDB** after first download (~7MB, or ~3.5MB with FP16 quantization)
- **WebGPU** acceleration (all major browsers 2026), **WASM** fallback
- **Secondary model loaded only on request** ("Try alt-mode" button) — avoids 14MB upfront download
- **Auto code-split**: `onnxruntime-web` only loaded on the classify route (TanStack Router)

### Server-Side Fallback (Optional, Phase 4.0c-3)

- `POST /ml/classify` endpoint using `onnxruntime-node`
- For old devices, failed client inference, or two-model orchestration
- Not required for MVP — progressive enhancement
- CPU inference on ~7MB MobileNetV3: <50ms per image on 2-core VPS, no GPU required
- Memory: ~200-400MB per loaded model

## Model Delivery

### API Endpoint: `GET /ml/models` (authenticated, rate-limited)

Returns available models with version, accuracy, and download URLs. Label maps are excluded (fetched separately via `metadata_url` to keep the response lean at scale). Auto-discovers models by scanning `ML_MODELS_PATH` for `*-metadata.json` files.

```json
{
  "models": [
    {
      "name": "primary-classifier",
      "version": "primary-classifier-20260331-c117-a83.8",
      "category": "primary",
      "format": "onnx",
      "size_bytes": 6870550,
      "accuracy": 0.838,
      "class_count": 117,
      "input_shape": [1, 3, 224, 224],
      "download_url": "http://localhost:3010/ml/model-files/primary-classifier-20260331-c117-a83.8.onnx",
      "metadata_url": "http://localhost:3010/ml/model-files/primary-classifier-20260331-c117-a83.8-metadata.json",
      "trained_at": "2026-03-31T00:59:50.123Z",
      "exported_at": "2026-03-31T01:10:30.456Z"
    }
  ]
}
```

### Static File Serving

- **Dev:** `@fastify/static` at `/ml/model-files/` prefix (distinct from API route at `/ml/models`)
- **Prod:** CDN via `ML_MODELS_BASE_URL` env var

### Config

- `ML_MODELS_PATH` — directory containing model artifacts (optional; returns empty array when unset)
- `ML_MODELS_BASE_URL` — CDN base URL for download/metadata URLs (defaults to `http://localhost:{port}/ml/model-files`)

### Client-Side Caching Strategy

1. Fetch model metadata via TanStack Query (staleTime: 1 hour)
2. Compare version with IndexedDB-cached version
3. On mismatch: download new model in background, swap when ready
4. On match: use cached model immediately

## UI Flow

```
Collection page → "Add by Photo" button in header
  → Modal sheet slides open with photo drop zone (reuses DropZone pattern)
  → User selects/drops a photo
  → Model downloads on first use (progress bar), cached in IndexedDB for subsequent uses
  → Client-side inference via onnxruntime-web (dynamic import, not in main bundle)
  → Top-5 predictions with confidence bars and "Add" buttons
  → Clicking "Add" opens AddToCollectionDialog (existing component, condition + notes)
  → "Try alt-mode" button re-runs inference with secondary model
  → "Browse catalog" fallback link
```

## New Files

### ML Service Layer (`web/src/ml/`) — framework-agnostic, no React

- `types.ts` — ML types (ModelCacheEntry, Prediction, InferenceResult, DownloadPhase)
- `model-cache.ts` — IndexedDB cache + model download with progress (handles .onnx + .onnx.data sidecar)
- `image-classifier.ts` — ONNX session management + canvas preprocessing + inference
- `label-parser.ts` — parse `franchise__item-slug` labels, build catalog URLs

### Collection Feature (`web/src/collection/`)

- `hooks/useMlModels.ts` — TanStack Query for `GET /ml/models`
- `hooks/usePhotoIdentify.ts` — stateful orchestration hook (download → classify → results)
- `components/AddByPhotoSheet.tsx` — modal sheet with phases (drop zone → progress → results)

### API (`api/src/ml/`)

- `routes.ts` — top-level ML plugin (registers sub-plugins)
- `models/routes.ts` — `GET /ml/models` handler
- `models/schemas.ts` — Fastify JSON response schemas
- `models/scanner.ts` — directory scan + metadata parse + type guard
- `models/url-builder.ts` — pure URL construction for download/metadata URLs
- `models/metadata-schema.ts` — type guard for `-metadata.json` files
- `models/scanner.test.ts` — unit tests for scanner
- `models/url-builder.test.ts` — unit tests for URL builder
- `models/routes.test.ts` — integration tests
- Optional future: `POST /ml/classify` (Phase 4.0c-3), telemetry endpoints

### ML (`ml/scripts/`)

- `train.py`, `export.py`, `validate.py`, `requirements.txt`

## Dependencies

- `web/package.json`: + `onnxruntime-web`
- `api/package.json`: + `onnxruntime-node` (optional, Phase 4.0c-3 only)
- `ml/requirements.txt`: torch, torchvision, coremltools, onnx

## Implementation Sequence

1. **Phase 4.0b** — ✅ PyTorch training scripts + dual export + validation
2. **Phase 4.0c-1** — ✅ Model metadata API + static file serving
3. **Phase 4.0c-2** — ✅ Client-side inference ("Add by Photo" on collection page, ONNX session, IndexedDB caching)
4. **Phase 4.0c-T** — ✅ ML inference telemetry (events table, POST /ml/events, admin dashboard at /admin/ml with recharts)
5. **Phase 4.0c-3** — Server-side fallback (optional, progressive enhancement)
6. **Phase 4.0c-4** — Secondary model support, curator integration, E2E tests

## Risks

| Risk                              | Mitigation                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| PyTorch accuracy < Create ML      | Benchmark both; same MobileNet architecture family, expect parity           |
| 7MB model download UX             | FP16 quantization halves to ~3.5MB; IndexedDB caching for repeat visits     |
| WASM fallback slow on old devices | Server-side fallback (Phase 4.0c-3)                                         |
| Training workflow complexity      | Python scripts are CLI tools; existing Node.js data prep pipeline unchanged |
| IndexedDB quota on mobile Safari  | 7MB well within limits; evict old versions on update                        |
