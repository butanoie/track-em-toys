# ML Category-Based Tier System

**Date:** 2026-03-31
**Time:** 02:55:07 UTC
**Type:** Feature
**Phase:** 4.0a (Training Data Preparation)
**Version:** v0.1.0

## Summary

Restructured the ML seed-images tier system from 3 tiers (`catalog/`, `training-only/`, `training-test/`) to a category-based system with 8 tiers: 4 training (`training-primary`, `training-secondary`, `training-package`, `training-accessories`) and 4 test (`test-primary`, `test-secondary`, `test-package`, `test-accessories`). The `catalog/` tier is now excluded from ML training entirely (product gallery only). Added `--category` flag for single-tier filtering, `--no-augment` flag, and `ML_TEST_DATA_PATH` env var.

---

## Changes Implemented

### 1. Category-Based Tier Restructuring

Replaced the flat tier model with category-based tiers that distinguish image types (primary hero shots, alternate views, packaging, accessories). Each category exists independently for both training and test sets, enabling per-category model training.

**Key behavior changes:**

- `catalog/` tier no longer included in ML scans — training tiers only
- `scanSourceDir()` API changed from `(dir, testSet?)` to `(dir, ScanOptions?)` with `testSet` and `category` fields
- `ManifestEntry` now carries an optional `category` field derived from tier name
- Output directory auto-appends category subdirectory when using env defaults

### 2. New CLI Flags

- `--category <name>` — Filter to a single image category (`primary|secondary|package|accessories`). Scans only the matching tier (e.g., `--category primary` → `training-primary/`).
- `--no-augment` — Copy originals without augmentation (previously only possible via `--test-set`)
- `--test-set` now defaults output to `ML_TEST_DATA_PATH` env var instead of `ML_TRAINING_DATA_PATH`

### 3. Documentation Updates

Updated ADR, test scenarios, roadmap, and module docs to reflect the new tier structure.

**Modified:**

- `ml/src/types.ts` — Added `ImageCategory` type, `category` field on `ManifestEntry`, `category` and `noAugment` on `CliOptions`
- `ml/src/scan.ts` — New `ScanOptions` interface, category-based tier constants, category derivation from tier name
- `ml/src/scan.test.ts` — Rewrote test tree to use new tiers, added 4 new test cases for category filtering
- `ml/src/prepare-training-data.ts` — `--category`, `--no-augment` parsing, env-based output path logic, `skipAugment` unification
- `ml/.env.example` — Added `ML_TEST_DATA_PATH`
- `ml/CLAUDE.md` — Updated tier documentation and CLI examples
- `ml/README.md` — Updated directory structure diagram, CLI options, and usage examples
- `ml/package.json` — Added `prepare-test-data` script
- `docs/decisions/ADR_ML_Training_Data_Preparation.md` — Added 2026-03-30 extension section
- `docs/plans/Development_Roadmap_v1_0.md` — Updated Phase 4.0a checklist
- `docs/test-scenarios/UNIT_ML_TRAINING_DATA.md` — Rewrote tier scenarios, added category filtering scenarios

---

## Technical Details

### Tier Constants

```typescript
const TRAINING_TIERS = ['training-primary', 'training-secondary', 'training-package', 'training-accessories'] as const;
const TEST_TIERS = ['test-primary', 'test-secondary', 'test-package', 'test-accessories'] as const;
```

### Category Derivation

Category is extracted from the tier name by stripping the prefix:

```typescript
const category = tier.slice(tier.indexOf('-') + 1) as ImageCategory;
```

### Output Path Logic

When `--category` is set and no explicit `--output` is provided, the category name is appended as a subdirectory:

```
ML_TRAINING_DATA_PATH/primary/   (with --category primary)
ML_TRAINING_DATA_PATH/           (without --category, all tiers merged)
ML_TEST_DATA_PATH/primary/       (with --test-set --category primary)
```

---

## Validation & Testing

```
✅ 94 tests passed (7 test files)
✅ TypeScript typecheck passed
✅ ESLint passed (0 warnings)
```

New test cases added:

- `populates category from tier name`
- `category filter scans only the matching tier`
- `category filter works with testSet`
- `category filter with no matching images throws`

---

## Impact Assessment

- **ML pipeline** — Enables training per-category models (e.g., primary-only classifier) without manual directory filtering
- **Seed images** — Existing `catalog/` + `training-only/` directories must be reorganized into the new tier structure
- **Breaking** — `scanSourceDir` signature changed from positional boolean to options object; `catalog/` images no longer included in training scans

---

## Related Files

| File                                                 | Change                              |
| ---------------------------------------------------- | ----------------------------------- |
| `ml/src/types.ts`                                    | `ImageCategory` type, new fields    |
| `ml/src/scan.ts`                                     | `ScanOptions`, category-based tiers |
| `ml/src/scan.test.ts`                                | Rewrote test tree, +4 tests         |
| `ml/src/prepare-training-data.ts`                    | CLI flags, output logic             |
| `ml/.env.example`                                    | `ML_TEST_DATA_PATH`                 |
| `ml/CLAUDE.md`                                       | Tier docs                           |
| `ml/README.md`                                       | Usage docs                          |
| `docs/decisions/ADR_ML_Training_Data_Preparation.md` | New extension section               |
| `docs/plans/Development_Roadmap_v1_0.md`             | Phase 4.0a update                   |
| `docs/test-scenarios/UNIT_ML_TRAINING_DATA.md`       | Category scenarios                  |

---

## Summary Statistics

- **12 files** changed
- **352 lines** added, **90 lines** removed
- **4 new tests** added (94 total)
- **2 commits**: `c86f25b` (test-set mode), `9a3a4e5` (category tiers)

---

## Status

✅ COMPLETE
