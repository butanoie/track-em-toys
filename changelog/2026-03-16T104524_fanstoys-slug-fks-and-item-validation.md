# FansToys Slug-Based FKs and Item Validation Tests

**Date:** 2026-03-16
**Time:** 10:45:24 -0700
**Type:** Feature / Configuration
**Phase:** 1.4 (Catalog Schema/Seed)
**Version:** v0.4.0

## Summary

Converted all 118 FansToys seed items from integer ID references to slug-based foreign key convention (`manufacturer_slug`, `toy_line_slug`, `character_slug`), removed denormalized fields, and moved ancillary data into a `metadata` JSONB object. Added Guardian Robot to `g1-season1.json` to resolve an unresolved character reference. Extended the seed validation test suite with item-specific checks covering FK integrity, slug format, duplicates, required fields, and legacy integer ID detection.

---

## Changes Implemented

### 1. FansToys Seed Data Migration to Slug-Based FKs

Rewrote all 118 item entries in the FansToys seed file to follow the project's slug-based FK convention.

**Before (integer IDs):**

```json
{
  "manufacturer_id": 1,
  "toy_line_id": 104,
  "character_faction_id": 2,
  "character_sub_group_id": 5,
  "status": "released",
  "variant_type": null
}
```

**After (slug-based FKs):**

```json
{
  "manufacturer_slug": "fanstoys",
  "toy_line_slug": "fanstoys-mainline",
  "character_slug": "optimus-prime",
  "metadata": {
    "status": "released",
    "variant_type": null,
    "sub_brand": null,
    "notes": null
  }
}
```

**Changes applied to each item:**

- `manufacturer_id` → `manufacturer_slug`
- `toy_line_id` → `toy_line_slug`
- Removed `character_faction_id` and `character_sub_group_id` (denormalized convenience fields — canonical source is the characters table)
- Moved `status`, `variant_type`, `sub_brand`, `notes` into `metadata` JSONB
- Updated `_metadata` import instructions to reflect the slug resolution workflow

**Modified:**

- `api/db/seed/manufacturers/fanstoys/fanstoys.json` — Full rewrite of 118 items (+2,133 / −2,250 lines from format changes)

### 2. Guardian Robot Character Addition

Added Guardian Robot to the G1 Season 1 character file to resolve an unresolved `character_slug` reference from the FT-20G item.

**Modified:**

- `api/db/seed/characters/g1-season1.json` — Added Guardian Robot character entry (+22 lines)

### 3. Item Seed Validation Tests

Extended the existing seed validation test suite with a new `item seed files` section covering 7 validation checks.

**Tests added:**
| Test | Purpose |
|------|---------|
| `_metadata.total_items matches items array length` | Catches metadata/data drift |
| `slug format valid` | Enforces lowercase-kebab-case convention |
| `no duplicate item slugs` | Prevents duplicate entries within a file |
| `manufacturer_slug resolves to manufacturers` | FK integrity check |
| `toy_line_slug resolves to toy_lines` | FK integrity check |
| `character_slug resolves to characters` | FK integrity check |
| `required item fields present` | Structural validation |
| `no integer ID fields (must use slugs)` | Guardrail against regression to old convention |

**Modified:**

- `api/src/db/seed-validation.test.ts` — Added `ItemRecord`/`ItemFile` interfaces, `loadItemFile` loader, derived lookup sets, and 8 test cases (+135 lines)

---

## Technical Details

### Why Slug-Based FKs Over Integer IDs

Integer ID references in seed data create fragile positional coupling:

- They depend on insertion order — reseeding or adding a row shifts all downstream IDs
- They're opaque in code review — `"manufacturer_id": 1` conveys no meaning
- They break when migrating between environments with different seed histories

Slug-based references are stable, human-readable, and insertion-order-independent. The seed ingestion script resolves slugs to UUIDs at import time via `WHERE slug = $1` lookups.

### Legacy Integer ID Detection

The test `no integer ID fields (must use slugs)` explicitly checks that none of the legacy fields (`manufacturer_id`, `toy_line_id`, `character_id`, `character_faction_id`, `character_sub_group_id`) exist on any item. This acts as a compile-time-equivalent guardrail: if anyone re-introduces integer IDs, the test suite fails immediately.

### Metadata JSONB Pattern

Fields like `status`, `variant_type`, `sub_brand`, and `notes` are item-level attributes that don't warrant dedicated columns in the early schema. Storing them in a `metadata` JSONB field keeps the core `items` table lean while preserving the data for future use. They can be promoted to proper columns if query patterns demand it.

---

## Validation & Testing

498 tests passing after changes.

**New test coverage (+135 lines):**

- 8 parameterized test cases via `it.each(itemFiles)` covering all item seed files
- FK integrity checks cross-reference against loaded manufacturer, toy line, and character seed data
- Duplicate detection uses a `Set` accumulator per file

---

## Impact Assessment

- **Seed data convention**: Establishes slug-based FKs as the standard for all item seed files going forward — enforced by tests
- **Data integrity**: FK integrity checks catch broken references before they reach the database
- **Character completeness**: Adding Guardian Robot fills a gap in the G1 character catalog
- **Future seed files**: The test framework automatically validates any new item files added to the `ITEM_FILES` array

---

## Related Files

**Modified (3):**

- `api/db/seed/manufacturers/fanstoys/fanstoys.json`
- `api/db/seed/characters/g1-season1.json`
- `api/src/db/seed-validation.test.ts`

---

## Summary Statistics

| Metric                 | Count              |
| ---------------------- | ------------------ |
| Files modified         | 3                  |
| Lines added            | ~1,226             |
| Lines removed          | ~1,203             |
| Items converted        | 118                |
| Validation tests added | 8                  |
| Total tests passing    | 498                |
| Characters added       | 1 (Guardian Robot) |

---

## Status

✅ COMPLETE
