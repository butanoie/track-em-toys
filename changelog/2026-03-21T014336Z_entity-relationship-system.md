# Entity Relationship System & Item Character Depictions

**Date:** 2026-03-21
**Time:** 01:43:36 UTC
**Type:** Feature
**Phase:** 1.4 (Catalog Schema & Seed)
**Version:** v0.5.0

## Summary

Implemented a first-class entity relationship system replacing legacy inline combiner fields and single-character item FKs. Three new DB tables (`character_relationships`, `item_character_depictions`, `item_relationships`) with full seed ingestion, API endpoints, and updated item/character response shapes. Resolves issue #80.

---

## Changes Implemented

### 1. Database Migrations (024-027)

Four sequential migrations implementing the additive-first strategy:

- **024**: `character_relationships` table — typed character-to-character relationships with `UNIQUE(type, entity1_id, entity2_id)` and self-reference prevention
- **025**: `item_character_depictions` junction table — items link to characters through `character_appearances`, with partial unique index enforcing one primary per item. Includes backfill from existing data.
- **026**: `item_relationships` table — mold-origin, gift-set-contents, variant relationships. Seed data in `item_relationships/*.json`, ingested at step 6c
- **027**: Drops legacy columns (`characters.combined_form_id`, `characters.combiner_role`, `items.character_id`, `items.character_appearance_id`)

### 2. Seed Ingestion Pipeline

- New `upsertCharacterRelationships()` — step 5.7, auto-discovers `relationships/*.json`, resolves entity slugs to UUIDs
- New `upsertItemCharacterDepictions()` — step 6b, auto-generates depiction rows from item `character_appearance_slug` fields using DELETE-then-INSERT pattern
- Removed dead `upsertCharactersPass2()` (combined_form_slug resolution)
- Removed `combined_form_slug` and `combiner_role` from `CharacterRecord` interface
- Updated `runPurge` TRUNCATE list with new tables

### 3. API Response Shape Changes

**Items**: `character: { slug, name }` (single object) → `characters: [{ slug, name, appearance_slug, is_primary }]` (array)
- List queries use `json_agg` correlated subquery instead of JOIN (avoids row multiplication)
- Character and continuity_family filters use `EXISTS` subqueries through the depictions junction
- Detail queries fetch depictions in parallel with photos

**Characters**: Removed `combiner_role`, `combined_form`, `component_characters` from detail response. `is_combined_form` flag remains.

### 4. New Relationship API Endpoints

- `GET /catalog/franchises/:franchise/characters/:slug/relationships` — bidirectional UNION ALL query returning all relationships for a character
- `GET /catalog/franchises/:franchise/items/:slug/relationships` — same pattern for item-to-item relationships (returns empty array until seed data exists)

### 5. Web Frontend Updates

- Updated Zod schemas: `CatalogItemSchema`, `CatalogItemDetailSchema`, `CatalogCharacterDetailSchema`
- Added `CharacterDepictionSchema`, `CharacterDepictionDetailSchema`, relationship schemas
- Updated `ItemDetailContent` to render primary character from array
- Removed combiner UI from `CharacterDetailContent` (kept `is_combined_form` badge)
- Updated all test fixtures and mock data

---

## Technical Details

### Data Model: Appearance-Only Junction

Items link to characters exclusively through `character_appearances`:

```
item_character_depictions.appearance_id → character_appearances.id
character_appearances.character_id → characters.id
```

No direct `character_id` on the junction table — character is always derived. This eliminates redundant data at negligible performance cost (sub-millisecond at current scale, ~5ms difference at 1M items).

### Query Pattern: json_agg Subquery

```sql
COALESCE(
  (SELECT json_agg(json_build_object(...) ORDER BY icd.is_primary DESC, ch.name ASC)
   FROM item_character_depictions icd
   JOIN character_appearances ca ON ca.id = icd.appearance_id
   JOIN characters ch ON ch.id = ca.character_id
   WHERE icd.item_id = i.id),
  '[]'::json
) AS characters
```

pg driver auto-parses JSON columns — no manual `JSON.parse` needed.

---

## Validation & Testing

- ✅ 630 API tests pass (31 files)
- ✅ 463 web tests pass (62 files)
- ✅ API typecheck clean (pre-existing photos error only)
- ✅ Web typecheck, lint, build all clean
- ✅ Prettier formatting passes
- New seed validation section 11: depiction coverage + appearance-character consistency
- New seed validation section 12: item relationship files (metadata, FK integrity, type validation, slug format, duplicates)
- Updated integration tests: new FK integrity checks, row count assertions, depiction correctness
- Relationship route tests: 8 tests covering happy path, 404, empty, nullable fields, multiple types

---

## Impact Assessment

- **Breaking API change**: `character` → `characters` (array) on all item responses. Web frontend updated accordingly.
- **Breaking API change**: `combiner_role`, `combined_form`, `component_characters` removed from character detail. Data now available via `/:slug/relationships` endpoint.
- **Seed data compatible**: Item JSON files unchanged (`character_slug` + `character_appearance_slug` preserved). Ingest auto-generates depiction rows.
- **Database**: 4 new migrations must be applied. Migration 025 backfills existing data automatically.

---

## Related Files

**Created:** `api/db/migrations/024-027_*.sql`, `api/src/catalog/relationships/{queries,routes,schemas}.ts`, `docs/test-scenarios/INT_ENTITY_RELATIONSHIPS.md`

**Modified:** `api/db/seed/ingest.ts`, `api/src/catalog/{items,characters,manufacturers,shared}/*.ts`, `api/src/db/seed-{validation,integration}.test.ts`, `web/src/lib/zod-schemas.ts`, `web/src/catalog/components/*.tsx`, various test files, `docs/test-scenarios/*.md`, `docs/decisions/Schema_Design_Rationale.md`, `api/db/seed/README.md`, `CLAUDE.md`, `api/CLAUDE.md`

---

## Status

✅ COMPLETE

## Next Steps

- ✅ ~~Write relationship route tests~~ — 8 tests in `api/src/catalog/relationships/routes.test.ts`
- ✅ ~~Add item relationship seed data~~ — `item_relationships/*.json` with ingestion (step 6c) and validation (section 12)
- Wire relationship UI into character detail page (TanStack Query hook + rendering)
- E2E tests for updated item detail page
