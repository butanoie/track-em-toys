# ADR: Franchise Normalization

**Date:** 2026-03-17
**Status:** Accepted
**Depends on:** Phase 1.4 seed ingestion complete
**Blocks:** Phase 1.5 catalog API (franchise filter consistency)
**Issue:** [#44 — Normalize franchise TEXT to franchises reference table](https://github.com/butanoie/track-em-toys/issues/44)

---

## Context

`franchise` is currently a free TEXT column on 5 catalog tables. When the catalog expands beyond Transformers to G.I. Joe, Star Wars, Macross, and other Hasbro/third-party franchises, this creates several problems.

### Current State

| Table                 | Column Definition                                | Current Values         |
| --------------------- | ------------------------------------------------ | ---------------------- |
| `characters`          | `franchise TEXT NOT NULL DEFAULT 'Transformers'` | "Transformers"         |
| `continuity_families` | `franchise TEXT`                                 | "Transformers" or NULL |
| `factions`            | `franchise TEXT`                                 | "Transformers" or NULL |
| `sub_groups`          | `franchise TEXT`                                 | "Transformers" or NULL |
| `toy_lines`           | `franchise TEXT`                                 | "Transformers" or NULL |

Franchise is used in two unique indexes:

- `idx_characters_name_franchise_cf`: `(lower(name), lower(franchise), continuity_family_id)` — character identity boundary
- `idx_sub_groups_name_franchise`: `(lower(name), COALESCE(franchise, ''))` — allows same sub-group name across franchises

### Problems with Free Text

1. **No consistency enforcement**: Nothing prevents "Transformers" vs "transformers" vs "TF" vs "Transformers G1"
2. **No slug for URLs**: The catalog API needs `?franchise=transformers` but the TEXT column stores "Transformers" — requires case-insensitive comparison
3. **No metadata**: Franchises will need display names, descriptions, logos, sort order
4. **No FK enforcement**: A typo in seed data silently creates a new "franchise" with no warning
5. **No discoverability**: `GET /catalog/franchises` must use `SELECT DISTINCT` rather than querying a proper table

### Tables That Reference Franchise

Franchise is the **top-level domain boundary** for the catalog. When G.I. Joe collectors browse, they need:

- Characters filtered by franchise
- Items filtered by franchise (via character)
- Factions scoped to franchise (Cobra is G.I. Joe, Decepticon is Transformers)
- Sub-groups scoped to franchise
- Continuity families scoped to franchise
- Toy lines scoped to franchise
- Search scoped to franchise

Manufacturers are franchise-agnostic (Hasbro makes both Transformers and G.I. Joe).

---

## Decision: `franchises` Reference Table

### New Table

```sql
CREATE TABLE franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No `updated_at` — reference table, same pattern as `factions`, `sub_groups`, `continuity_families`.

Columns follow the `continuity_families` pattern: `notes` instead of `description` for consistency across reference tables.

### Initial Seed Data

```json
[
  { "name": "Transformers", "slug": "transformers", "sort_order": 1, "notes": "..." },
  { "name": "G.I. Joe", "slug": "gi-joe", "sort_order": 2, "notes": "..." },
  { "name": "Star Wars", "slug": "star-wars", "sort_order": 3, "notes": "..." },
  { "name": "Macross", "slug": "macross", "sort_order": 4, "notes": "..." }
]
```

4 initial franchises. Only "Transformers" and "G.I. Joe" are populated in the catalog initially. Star Wars and Macross are placeholders for future expansion.

### Naming Convention

- **Seed JSON**: `franchise_slug` (slug string) — consistent with `faction_slug`, `manufacturer_slug`, etc.
- **DB column + TypeScript**: `franchise_id` (UUID FK) — consistent with `faction_id`, `continuity_family_id`, etc.

This follows the established dual convention where seed data uses human-readable slugs and the database stores resolved UUIDs.

### franchise_id Nullability

**NOT NULL on all 5 tables.** Cross-franchise entities (Human, Neutral, Other factions) are assigned to the Transformers franchise for now. When these factions are needed for other franchises, they get duplicated per franchise with globally unique slugs (e.g., `human-transformers`, `human-gi-joe`).

### Cross-Franchise Entity Strategy

Factions like "Human", "Neutral", and "Other" are currently `franchise: null` because they could apply to any franchise. With NOT NULL franchise_id, these are assigned to Transformers (their current sole context). When G.I. Joe or Star Wars characters are added:

1. Duplicate the faction per franchise with franchise-suffixed slugs
2. Existing slugs (`human`, `neutral`, `other`) remain as Transformers-context entries
3. New entries get suffixed slugs: `human-gi-joe`, `neutral-star-wars`

Global slug uniqueness ensures unambiguous API routes.

### Migration Strategy

Migration 015 performs:

1. Create the `franchises` table with inline seed data
2. Add `franchise_id UUID` column to all 5 tables (nullable initially)
3. Populate `franchise_id` via UPDATE + JOIN on text franchise column (NULL → defaults to Transformers)
4. Set `franchise_id NOT NULL` on all 5 tables
5. Add FK constraints (`ON DELETE RESTRICT`)
6. Drop old unique indexes, create new ones using `franchise_id`
7. Add FK performance indexes (`idx_*_franchise`)
8. Drop text `franchise` columns

### Impact on Existing Indexes

```sql
-- Before (text-based)
CREATE UNIQUE INDEX idx_characters_name_franchise_cf
  ON characters (lower(name), lower(franchise), continuity_family_id);
CREATE UNIQUE INDEX idx_sub_groups_name_franchise
  ON sub_groups (lower(name), COALESCE(franchise, ''));

-- After (FK-based)
CREATE UNIQUE INDEX idx_characters_name_franchise_cf
  ON characters (lower(name), franchise_id, continuity_family_id);
CREATE UNIQUE INDEX idx_sub_groups_name_franchise
  ON sub_groups (lower(name), franchise_id);
```

The sub_groups index simplifies from `COALESCE(franchise, '')` to just `franchise_id` since franchise_id is NOT NULL.

### Impact on Seed Data

All seed JSON files change `"franchise": "Transformers"` to `"franchise_slug": "transformers"`. The ingest script resolves franchise slugs to UUIDs like all other slug-based FKs.

### Impact on Catalog API (Phase 1.5)

With normalization:

- `?franchise=transformers` filters by `fr.slug = $1` via JOIN (consistent with all other slug filters)
- `GET /catalog/franchises` queries the table directly (not `SELECT DISTINCT`)
- No case-insensitive `lower()` comparison needed — slugs are canonical

---

## What This Unblocks

- Phase 1.5 catalog API uses consistent slug-based franchise filtering
- Multi-franchise seed data (G.I. Joe characters, items) can be added with FK enforcement
- Future franchise-specific features (franchise landing pages, franchise-scoped search)

---

## Alternatives Considered

### A. Keep TEXT, normalize later

Build Phase 1.5 with `lower(franchise) = lower($1)` filtering. Normalize when multi-franchise actually ships.

**Pros**: No schema change now, faster to Phase 1.5
**Cons**: Builds a text-based filtering pattern across 16+ endpoints that must all be retrofitted. Risk of franchise value inconsistency in seed data.

### B. Add CHECK constraint on TEXT column

`CHECK (franchise IN ('Transformers', 'G.I. Joe', ...))` — enforces valid values without a reference table.

**Pros**: Minimal schema change, prevents typos
**Cons**: Adding a franchise requires a migration to update the CHECK constraint. No slugs, no metadata, no FK join for filtering. Still needs `lower()` comparisons.

### C. Normalize now (chosen)

Create `franchises` reference table, migrate TEXT → FK.

**Pros**: Consistent with all other reference tables. Slug-based filtering. FK enforcement. Extensible with metadata.
**Cons**: Larger migration, seed data updates needed. Blocks Phase 1.5 briefly.
