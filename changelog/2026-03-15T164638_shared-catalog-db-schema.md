# Shared Catalog DB Schema - Migration 011 with UUID PKs and Slug Keys

**Date:** 2026-03-15
**Time:** 16:46:38 PDT
**Type:** Feature
**Version:** v0.2.0
**PR:** #23
**Issue:** #21

## Summary

Added 9 shared catalog tables to PostgreSQL via migration 011, establishing the core data model for the toy collection catalog. All tables use UUID primary keys (consistent with auth tables) and unique slug columns for URL-friendly API routes and stable seed data references. TypeScript interfaces and documentation updated across the project.

---

## Changes Implemented

### 1. Migration 011 - Shared Catalog Tables

9 new tables created in migration 011 (shared catalog layer, no `user_id`, no RLS). Migration 012 subsequently dropped `categories`, added `character_sub_groups`, and enriched `characters` and `users`:

| Table | Purpose | Slug | updated_at | Trigger |
|---|---|---|---|---|
| `factions` | Allegiances (Autobot, Decepticon) | Yes | No | No |
| `sub_groups` | Sub-teams (Dinobots, Constructicons) | Yes | No | No |
| `characters` | Franchise characters with combiner metadata | Yes | Yes | Yes |
| `character_sub_groups` | Many-to-many: characters ↔ sub_groups | No | No | No |
| `manufacturers` | Figure-producing companies | Yes | Yes | Yes |
| `toy_lines` | Product lines (Masterpiece, Classified) | Yes | Yes | Yes |
| `items` | Master catalog of figures | Yes | Yes | Yes |
| `item_photos` | Reference photos for catalog items | No | No | No |
| `catalog_edits` | Approval queue for community contributions | No | No | No |

**Created:**
- `api/db/migrations/011_shared_catalog_tables.sql` — 247 lines

### 2. TypeScript Types

9 interfaces and 3 union types added to match the migration schema exactly.

**Interfaces:** `Faction`, `SubGroup`, `Character`, `CharacterSubGroup`, `Manufacturer`, `ToyLine`, `Item`, `ItemPhoto`, `CatalogEdit`

**Union types:** `DataQuality`, `CatalogEditType`, `CatalogEditStatus`

**Modified:**
- `api/src/types/index.ts` — +124 lines

### 3. Documentation Updates

- `CLAUDE.md` — Added slug column and seed data conventions to Data Architecture
- `api/CLAUDE.md` — Added slug and seed data rules to Database conventions
- `docs/decisions/Schema_Design_Rationale.md` — New ADR explaining all design decisions
- `docs/diagrams/toy-catalog-database-diagrams.jsx` — ER diagram updated with all new tables, enriched fields, UUID PKs, relationships with ON DELETE behaviors
- `docs/decisions/Architecture_Research_*.md` — SQL snippets updated from BIGSERIAL to UUID

**Created:**
- `docs/decisions/Schema_Design_Rationale.md` — 155 lines

**Modified:**
- `CLAUDE.md`, `api/CLAUDE.md`, `docs/diagrams/toy-catalog-database-diagrams.jsx`, `docs/decisions/Architecture_Research_*.md`

---

## Technical Details

### Key Design Decisions

1. **UUID PKs** on all catalog tables — consistent with auth tables, avoids mixed PK type system
2. **Slug columns** (`TEXT UNIQUE NOT NULL`) on entity tables — stable URL-friendly identifiers, seed data join keys
3. **Normalized factions/sub_groups** — reference tables, not enums; new values are INSERTs, not migrations
4. **Enriched characters** — `faction_id`, `character_type`, `sub_group_id`, `alt_mode`, combiner self-referential FK, JSONB metadata
5. **ON DELETE SET NULL** on reference FKs — `combined_form_id`, `parent_id`, `faction_id`, `sub_group_id`
6. **CHECK constraint** on `items.data_quality` — `'needs_review' | 'verified' | 'community_verified'`

### Indexes

- `idx_characters_name_franchise` — UNIQUE on `(lower(name), lower(franchise))`
- `idx_characters_combined_form` — partial, WHERE `combined_form_id IS NOT NULL`
- `idx_catalog_edits_status` — partial, WHERE `status = 'pending'`
- `idx_items_product_code` — partial, WHERE `product_code IS NOT NULL`
- Standard B-tree indexes on all FK columns

---

## Validation & Testing

- Migration applied cleanly via `dbmate migrate`
- `api/db/schema.sql` auto-generated with all 13 tables (4 auth + 9 catalog)
- TypeScript typecheck passes: `npm run typecheck` — zero errors
- Migration version `011` registered in `schema_migrations`

---

## Impact Assessment

- **Database:** Schema grows from 4 auth tables to 13 total tables (auth + shared catalog)
- **API:** TypeScript types ready for route handlers and query functions
- **Seed data:** Slug convention established; seed import tracked separately in #22
- **Private collections:** Not included — will be a future migration with `user_id` + RLS

---

## Related Files

| File | Action |
|---|---|
| `api/db/migrations/011_shared_catalog_tables.sql` | Created |
| `api/db/schema.sql` | Modified (auto-generated) |
| `api/src/types/index.ts` | Modified |
| `docs/decisions/Schema_Design_Rationale.md` | Created |
| `docs/diagrams/toy-catalog-database-diagrams.jsx` | Modified |
| `docs/decisions/Architecture_Research_*.md` | Modified |
| `CLAUDE.md` | Modified |
| `api/CLAUDE.md` | Modified |

---

## Summary Statistics

- **8 files changed**, 1,347 insertions, 95 deletions
- **9 tables** created, **13 indexes**, **4 triggers**, **15 FK constraints**
- **9 TypeScript interfaces**, **3 union types** added
- **1 ADR** created (`Schema_Design_Rationale.md`)

---

## Status

COMPLETE
