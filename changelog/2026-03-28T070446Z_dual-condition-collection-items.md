# Dual Condition System for Collection Items

**Date:** 2026-03-28
**Time:** 07:04:46 UTC
**Type:** Feature
**Phase:** 1.8 (Personal Collection)
**Version:** v0.1.0

## Summary

Added a dual condition system to collection items: `package_condition` (renamed from `condition`, packaging state enum) and `item_condition` (new C-grade 1-10 integer scale for physical figure condition). Removed the `damaged` value from the packaging condition enum. Both conditions are filterable, included in stats, and exported/imported.

---

## Changes Implemented

### 1. Database Migration (033)

- Renamed `item_condition` PostgreSQL enum type to `package_condition` (without `damaged` value)
- Renamed `condition` column to `package_condition` on `collection_items`
- Migrated existing `damaged` rows to `unknown`
- Added `item_condition SMALLINT NOT NULL DEFAULT 5 CHECK (1-10)` column

### 2. API Layer

- Renamed `ItemCondition` type to `PackageCondition`, removed `damaged`
- Added `item_condition: number` to `CollectionItem`, `CollectionListRow`, and all route interfaces
- Added `item_condition_min` query parameter for filtered list
- Updated stats to include `by_package_condition` and `by_item_condition` aggregations
- Updated export/import to include both condition fields
- Updated PATCH handler to accept all three updatable fields

### 3. Web Layer

- Renamed Zod `CollectionConditionSchema` to `PackageConditionSchema`
- Created `item-condition-config.ts` with C-grade labels, descriptions, and color classes
- Created `ItemConditionSelector` component (2-row grid of C1-C10 buttons)
- Created `ItemConditionBadge` component (color-coded grade display)
- Updated `ConditionSelector` legend to "Package Condition"
- Added grade filter to `CollectionFilters` (preset dropdown: C5+, C7+, C8+, C9+, C10)
- Updated both add/edit dialogs, table, card, stats bar, and dashboard
- Updated route search params with `package_condition` and `item_condition_min`

### 4. Documentation

- Updated `INT_COLLECTION_API.md` test scenarios
- Updated database diagram files

**Created:**

- `api/db/migrations/033_dual_condition_collection_items.sql`
- `web/src/collection/lib/item-condition-config.ts`
- `web/src/collection/components/ItemConditionSelector.tsx`
- `web/src/collection/components/ItemConditionBadge.tsx`

**Modified:**

- `api/src/types/index.ts`, `api/src/collection/schemas.ts`, `api/src/collection/queries.ts`, `api/src/collection/routes.ts`
- `web/src/lib/zod-schemas.ts`, `web/src/collection/api.ts`, `web/src/collection/lib/condition-config.ts`
- `web/src/collection/components/` (8 components), `web/src/collection/hooks/useCollectionMutations.ts`
- `web/src/routes/_authenticated/collection.tsx`, `web/src/routes/_authenticated/index.tsx`
- `web/src/collection/pages/CollectionPage.tsx`
- All collection test files (9 unit test files, 4 E2E files)
- `docs/test-scenarios/INT_COLLECTION_API.md`, `docs/diagrams/toy-catalog-database-diagrams.jsx`

---

## Technical Details

### C-Grade Scale

| Grade | Label      | Description                                           |
| ----- | ---------- | ----------------------------------------------------- |
| C10   | Mint       | Perfect, factory-fresh, no flaws whatsoever           |
| C9    | Near Mint  | Near perfect, only the slightest imperfection         |
| C8    | Excellent  | Minor wear, tight joints, paint nearly flawless       |
| C7    | Very Good+ | Light wear, small paint chips or minor scuffs         |
| C6    | Very Good  | Some paint wear, joints functional, light marks       |
| C5    | Good+      | Moderate paint wear, some joint looseness             |
| C4    | Good       | Noticeable wear, visible scuffs, still displayable    |
| C3    | Fair       | Heavy wear, loose joints, paint loss                  |
| C2    | Poor       | Significant damage, broken parts, heavy discoloration |
| C1    | Junk       | Severely damaged, incomplete, parts-only condition    |

### PostgreSQL Enum Rename Pattern

PostgreSQL cannot drop enum values. The migration uses:

1. `ALTER TYPE item_condition RENAME TO _item_condition_old`
2. Migrate `damaged` rows to `unknown`
3. `CREATE TYPE package_condition AS ENUM (... 6 values ...)`
4. `ALTER TABLE ... RENAME COLUMN condition TO package_condition`
5. `ALTER TABLE ... ALTER COLUMN ... TYPE package_condition USING ...::text::package_condition`
6. `DROP TYPE _item_condition_old`
7. `ADD COLUMN item_condition SMALLINT ... CHECK (BETWEEN 1 AND 10)`

---

## Validation & Testing

| Module | Tests      | Lint       | Typecheck | Format   | Build    |
| ------ | ---------- | ---------- | --------- | -------- | -------- |
| API    | 741 passed | 0 warnings | 0 errors  | 0 issues | 0 errors |
| Web    | 687 passed | 0 warnings | 0 errors  | 0 issues | 0 errors |

---

## Impact Assessment

- **Breaking API change**: `condition` field renamed to `package_condition`, `by_condition` renamed to `by_package_condition` in stats. Pre-production, no external consumers.
- **Export backward compat**: Old v1 exports with `condition` field cannot be re-imported. Acceptable for pre-production.
- **Manual step required**: Run migration 033 and regenerate `schema.sql` via `dbmate dump`.

---

## Status

✅ COMPLETE (pending migration execution and schema.sql regeneration)
