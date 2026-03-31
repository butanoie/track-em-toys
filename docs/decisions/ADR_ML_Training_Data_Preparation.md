# ADR: ML Training Data Preparation Pipeline

## Status

Implemented (2026-03-21), extended (2026-03-22)

## Context

Phase 4.0a of the roadmap requires a training data preparation pipeline that bridges the existing ML export endpoint (`POST /catalog/ml-export`, Phase 1.9 Slice 3) and Create ML model training (Phase 4.0b). The ML export endpoint already generates manifest JSON files with photo paths and labels. The pipeline needs to transform this manifest into Create ML's expected folder-per-class structure with augmented images.

Two test classes are available: Commander Stack (18 photos) and Margh (19 photos), both Transformers items.

### 2026-03-22 Extension: Directory Scan Mode

A `--source-dir` flag was added as an alternative to `--manifest`, allowing the pipeline to scan a seed-images directory tree directly instead of requiring an API export. This supports larger-scale training from curated image collections stored on external drives, organized as `{tier}/{franchise}/{manufacturer}/{item}/{images}`. Directories named `_unmatched/` are skipped.

### 2026-03-30 Extension: Category-Based Tier System

The tier system was restructured from 3 tiers (`catalog/`, `training-only/`, `training-test/`) to category-based tiers: `training-primary`, `training-secondary`, `training-package`, `training-accessories` for training data, and `test-primary`, `test-secondary`, `test-package`, `test-accessories` for held-out evaluation sets. The `catalog/` tier is now excluded from ML training entirely (used only for the product gallery DB). A `--category` flag filters to a single category (e.g., `--category primary` scans only `training-primary/`). A `--no-augment` flag copies originals without augmentation. Output defaults to `ML_TEST_DATA_PATH` env when `--test-set` is used. Category subdirectories are auto-appended to the output path when using env defaults.

## Decision

### Architecture: Fully Modular Node.js/TypeScript Pipeline

The `ml/` module gets its own `package.json` as a standalone Node.js project (not an npm workspace member). The pipeline is implemented as separate modules with clear interfaces:

- `src/types.ts` — Shared interfaces (mirrors API manifest types)
- `src/manifest.ts` — Parse + validate manifest JSON, group entries by label
- `src/balance.ts` — Class balance analysis and reporting
- `src/transforms.ts` — Augmentation transform registry (composable, extensible)
- `src/augment.ts` — Augmentation orchestrator (adaptive target-based)
- `src/copy.ts` — File copy operations with idempotency
- `src/validate.ts` — Output structure validation against Create ML format
- `src/scan.ts` — Directory tree scanner (produces Manifest from seed-images directory)
- `src/prepare-training-data.ts` — CLI entry point (supports `--manifest` or `--source-dir`)

Each module (except entry point and types) has a companion `.test.ts` file.

### Key Design Decisions

**1. Label Flattening (Critical)**

Create ML's `MLImageClassifier` with `.labeledDirectories(at:)` uses single-level directory nesting — subdirectory name = class label. The manifest label format `franchise_slug/item_slug` would create nested directories that Create ML cannot interpret correctly.

Solution: Flatten labels using `__` (double underscore) as delimiter: `transformers__mx-xxii-commander-stack`. Slugs use hyphens only, making `__` unambiguous and reversible.

**2. Adaptive Augmentation**

Rather than uniform augmentation, the pipeline sets a target count per class (default 100) and applies more augmentation to classes with fewer originals. This automatically balances class sizes. Transform selection is deterministic (modulo cycling) for reproducibility.

**3. Compound Transforms**

Transforms include combinations (flip+rotate, flip+brightness, rotate+brightness) for greater augmentation diversity. The registry contains ~15 compound transforms built from: horizontal flip, rotation (±10°), and brightness (±20%).

**4. Clean-on-Rerun**

Each class directory is fully cleaned before repopulation to prevent orphaned files from manifest changes, deleted photos, or changed target counts. A `--no-clean` flag preserves existing output for performance.

**5. WebP with JPEG Fallback**

Photos are kept as WebP (supported on macOS 14+). A `--format` flag allows switching to JPEG if Create ML compatibility issues are discovered empirically.

**6. Output Location**

Training data is written to `ML_TRAINING_DATA_PATH` (new env var), pointing to the private `track-em-toys-data` repository. This keeps large binary training data out of the main repo.

### Alternatives Considered

- **Single-file script**: Simpler but untestable and harder to extend.
- **Python/PIL**: Richer ML ecosystem but adds a new language dependency. Node.js/sharp keeps the toolchain unified.
- **Symlinks instead of copies**: Less disk usage but breaks portability across machines.
- **Database-direct queries**: Would eliminate the manifest intermediary but couples the ML pipeline to the API's database.
- **Directory scan only (no manifest mode)**: Simpler but loses the ability to leverage API filters (franchise, search query, approval status). Both modes are retained for different workflows.

## Consequences

- `ml/` becomes an active code module with its own dependencies, tests, and CI surface
- `sharp` is declared as a separate dependency (same version as API)
- Training data output lives in the private data repo, not in this repo
- The manifest format (`version: 1`) is now a contract consumed by two modules — changes require coordination
- Augmented file naming convention (`aug-{N}-{transform}.webp`) is deterministic and idempotent
