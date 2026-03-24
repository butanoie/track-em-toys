# ML Training Data — Directory Scan Mode

**Date:** 2026-03-22
**Time:** 22:14:19 UTC
**Type:** Feature
**Phase:** 4.0a

## Summary

Added `--source-dir` as an alternative input mode to the ML training data preparation pipeline, allowing direct scanning of a seed-images directory tree instead of requiring an API manifest export. This supports larger-scale training from curated image collections organized by tier (`catalog/` and `training-only/`), franchise, manufacturer, and item.

---

## Changes Implemented

### 1. Directory Scanner Module

New `scan.ts` module walks a seed-images directory tree with the structure `{tier}/{franchise}/{manufacturer}/{item}/{images}` and produces a `Manifest` object compatible with the existing pipeline — no changes needed to augmentation, copy, or validation modules.

**Created:**

- `ml/src/scan.ts` — Directory tree scanner, merges `catalog/` and `training-only/` tiers, skips `_unmatched/`
- `ml/src/scan.test.ts` — 8 tests covering tier merging, label format, skip rules, missing tiers, error cases

### 2. CLI Integration

Updated the CLI entry point to accept `--source-dir` as a mutually exclusive alternative to `--manifest`. The `CliOptions` type now uses a discriminated union (`CliSource`) for the input mode.

**Modified:**

- `ml/src/prepare-training-data.ts` — Added `--source-dir` flag, updated usage text, source-mode logging
- `ml/src/types.ts` — Added `CliSource` discriminated union, updated `CliOptions`

### 3. Documentation Updates

**Modified:**

- `ml/README.md` — Full rewrite reflecting actual pipeline modules, both input modes, seed-images structure, CLI options
- `ml/CLAUDE.md` — Updated Training Data Source section, Build Commands, and Augmentation notes
- `docs/decisions/ADR_ML_Training_Data_Preparation.md` — Added 2026-03-22 extension section, `scan.ts` in module list
- `docs/plans/Development_Roadmap_v1_0.md` — Phase 4.0a marked DONE, critical path table updated
- `docs/test-scenarios/UNIT_ML_TRAINING_DATA.md` — Added 6 Gherkin scenarios for directory scanning

---

## Technical Details

### Seed-Images Directory Structure

```
{source-dir}/
  catalog/                          # API-importable reference photos
    {franchise}/{manufacturer}/{item}/{images}
  training-only/                    # ML training only
    {franchise}/{manufacturer}/{item}/{images}
  _unmatched/                       # Ignored by tooling
```

### Adapter Pattern

`scanSourceDir()` returns the same `Manifest` type as `readManifest()`, so the downstream pipeline (balance → augment → copy → validate) required zero changes. Both tiers are merged naturally by `groupEntriesByLabel()` since entries from both tiers share the same `franchise/item` label.

### Usage

```bash
npm run prepare-data -- --source-dir "/path/to/test-images" --output "/path/to/output"
npm run prepare-data -- --source-dir "/path/to/test-images" --classes transformers/r-03-bovis
```

---

## Validation & Testing

```
 Test Files  7 passed (7)
      Tests  87 passed (87)
   Duration  254ms
```

TypeScript: zero errors (`npm run typecheck` clean).

---

## Impact Assessment

- Training data preparation no longer requires the API server to be running — images can be processed directly from disk
- Supports the curated seed-images collection on the external drive (293 items, 3,048 matched images across 5 manufacturers)
- The `catalog/` vs `training-only/` tier split enables a future API import workflow that only ingests catalog-quality images

---

## Related Files

| File                                                 | Change   |
| ---------------------------------------------------- | -------- |
| `ml/src/scan.ts`                                     | Created  |
| `ml/src/scan.test.ts`                                | Created  |
| `ml/src/prepare-training-data.ts`                    | Modified |
| `ml/src/types.ts`                                    | Modified |
| `ml/CLAUDE.md`                                       | Modified |
| `ml/README.md`                                       | Modified |
| `docs/decisions/ADR_ML_Training_Data_Preparation.md` | Modified |
| `docs/plans/Development_Roadmap_v1_0.md`             | Modified |
| `docs/test-scenarios/UNIT_ML_TRAINING_DATA.md`       | Modified |

---

## Status

✅ COMPLETE
