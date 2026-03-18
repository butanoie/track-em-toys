# Hasbro G1 Items, Seed Ingestion, and Research-Catalog Skill

**Date:** 2026-03-17
**Time:** 11:06:41 -0700
**Type:** Feature
**Phase:** 1.4 (Catalog Schema/Seed)
**Version:** v0.4.1

## Summary

Major catalog data expansion: consolidated G1 character files into a single 439-character file, added 439 character appearances spanning all G1 continuities, seeded 277 Hasbro G1 items (1984–1990) with verified product codes, and built the seed ingestion script (`ingest.ts`) that resolves slug-based FK references to UUIDs and upserts everything into PostgreSQL. Also added migration 014 (source_media CHECK constraint), created the research-catalog Claude skill, and extracted CLAUDE.md rules into dedicated `.claude/rules/` files.

---

## Changes Implemented

### 1. G1 Character Consolidation

Merged 10 per-season/per-source character files into a single `g1-characters.json` with 439 characters. This simplifies the seed directory structure and eliminates cross-file duplication.

**Created:**

- `api/db/seed/characters/g1-characters.json` — 439 characters across NA cartoon, toy-only, JP Headmasters, Masterforce, Victory, and Zone (7,132 lines)

**Deleted (10 files):**

- `api/db/seed/characters/g1-season1.json`
- `api/db/seed/characters/g1-season2.json`
- `api/db/seed/characters/g1-season3.json`
- `api/db/seed/characters/g1-season4.json`
- `api/db/seed/characters/g1-movie.json`
- `api/db/seed/characters/g1-toy-only.json`
- `api/db/seed/characters/jp-headmasters.json`
- `api/db/seed/characters/jp-masterforce.json`
- `api/db/seed/characters/jp-victory.json`
- `api/db/seed/characters/jp-zone.json`

Notable additions:

- **Jetfire** — split from Skyfire as a separate character (cartoon vs Macross-licensed toy are distinct entities in the collector market)
- **Guardian Robot** — previously missing, referenced by FansToys FT-20G

### 2. G1 Character Appearances

Created `g1-appearances.json` with 439+ appearances providing 1:1 character coverage across all G1 media sources, plus specialized toy-deco appearances.

**Created:**

- `api/db/seed/appearances/g1-appearances.json` — 5,596 lines covering:
  - NA cartoon appearances (TV)
  - Toy-only characters with no media appearance
  - JP Headmasters, Masterforce, Victory, Zone (TV)
  - 8 G1 cartoon-divergent toy appearances (Ratchet, Ironhide, Megatron, Ultra Magnus, Swoop, Bluestreak, Galvatron)
  - Astrotrain US/JP toy variants, RadioShack Shockwave
  - 47 G2 redecos (released + unreleased prototypes including Stunticons and Protectobots)
  - 11 distinctive toy liveries: Jazz (Martini), Smokescreen (#38 racing), Mirage (Gitanes F1), Wheeljack (Alitalia), Prowl (police), Hound (military), Tracks (flames), Red Alert (fire chief), Inferno (fire dept), Slag (chrome Diaclone), Bombshell (chrome Insector)

### 3. Hasbro G1 Items (277 entries, 1984–1990)

Seeded the complete Hasbro G1 toy line across 7 years with product codes sourced from TFArchive's Hasbro item number database.

**Created:**

- `api/db/seed/items/hasbro/g1-items.json` — 277 items (5,310 lines)

**Coverage by year:**
| Year | Count | Highlights |
|------|-------|-----------|
| 1984 | ~28 | Autobot Cars, Minibots, Seekers, Soundwave & Cassettes |
| 1985 | ~40 | Dinobots, Constructicons, Insecticons, Jumpstarters, Deluxe Vehicles |
| 1986 | ~60 | Movie heroes (Hot Rod, Ultra Magnus, Galvatron), Triple Changers, combiners, Battlechargers |
| 1987 | ~45 | Headmasters, Targetmasters, Terrorcons, Technobots, Horrorcons, Throttlebots, Duocons, Clones, Monsterbots |
| 1988 | ~50 | Powermasters, Pretenders (all sub-types), Double Targetmasters, Seacons, Sparkabots, Firecons, Triggerbots/Triggercons |
| 1989 | ~35 | Classic/Mega/Ultra Pretenders, Pretender Monsters, Legends (KMart exclusives) |
| 1990 | ~19 | Action Masters |

**Flagship items:** Fortress Maximus, Scorponok, Trypticon, combiner giftsets (Predaking, Bruticus, Abominus, Piranacon)

**Modeling decisions:**

- Cassette 2-packs modeled as single items with primary character FK
- Toy-specific appearance slugs used where toy and cartoon designs diverge
- `character_appearance_slug` FK links each item to its specific visual representation

### 4. Seed Directory Restructure

Renamed `api/db/seed/manufacturers/` → `api/db/seed/items/` to better reflect content semantics (items organized by manufacturer, not manufacturer data).

**Moved:**

- `api/db/seed/manufacturers/fanstoys/fanstoys.json` → `api/db/seed/items/fanstoys/fanstoys.json` (118 items updated with `character_appearance_slug`)

### 5. Seed Ingestion Script

Built the complete seed-to-database pipeline that resolves slug-based FK references to UUIDs and upserts data into PostgreSQL.

**Created:**

- `api/db/seed/ingest.ts` — 695-line TypeScript script with:
  - **Slug resolution**: `buildSlugMap()` loads all existing slugs from DB, `resolveSlug()` / `resolveOptionalSlug()` map slug strings to UUIDs at insert time
  - **Dependency-ordered upserts**: continuity families → factions → sub-groups → manufacturers → toy lines → characters (pass 1) → character sub-groups → characters (pass 2 for cross-refs) → appearances → items
  - **Two-pass character insert**: Pass 1 creates characters without cross-references; pass 2 back-fills leader/combiner FKs that point to other characters
  - **Upsert semantics**: `ON CONFLICT (slug) DO UPDATE` for idempotent re-runs
  - **Purge mode**: `--purge --confirm` truncates all catalog tables in reverse-FK order and re-seeds
  - **Auto-discovery**: Recursively finds all `.json` files in seed subdirectories

- `api/tsconfig.seed.json` — Dedicated TypeScript config for type-checking the ingest script separately from the main API

**npm scripts added:**

- `npm run seed` — Run ingest script (upsert mode)
- `npm run seed:purge` — Truncate + re-seed (requires `--confirm`)
- `npm run typecheck:seed` — Type-check ingest script independently

### 6. Migration 014: source_media CHECK Constraint

Added a database-level CHECK constraint on `character_appearances.source_media` to enforce valid values. Merged "Comic" and "Manga" into a single "Comic/Manga" value.

**Created:**

- `api/db/migrations/014_add_source_media_check.sql` — Adds CHECK constraint: `TV`, `Comic/Manga`, `Movie`, `OVA`, `Toy-only`, `Video Game`

**Modified:**

- `api/db/schema.sql` — Updated schema dump to reflect new constraint

### 7. Research-Catalog Skill

Created a Claude Code skill for researching Transformers toy and character data from web sources and generating seed JSON files.

**Created:**

- `.claude/skills/research-catalog/SKILL.md` — 649-line skill document covering:
  - TFArchive as primary source for Hasbro product codes
  - Appearance slug selection table (when to use toy vs cartoon appearance)
  - Multi-character product handling (cassette packs, combiner giftsets)
  - Bulk Python generation pattern for large item batches
  - Official item naming and slug conventions

### 8. CLAUDE.md Rules Extraction

Extracted three behavioral rules from CLAUDE.md into dedicated `.claude/rules/` files for better enforcement by Claude Code.

**Created:**

- `.claude/rules/commit-discipline.md` — Never commit without explicit instruction
- `.claude/rules/doc-gates-task-integration.md` — Documentation gates must appear as explicit tasks
- `.claude/rules/gh-issues-no-auto-close.md` — Never auto-close GitHub issues

**Modified:**

- `CLAUDE.md` — Consolidated documentation accuracy section, removed rules now in dedicated files

---

## Technical Details

### Two-Pass Character Upsert

Characters can reference other characters (e.g., a combiner team's leader, or a character's combined form). This creates circular FK dependencies that can't be resolved in a single INSERT pass.

**Pass 1** inserts all characters with `leader_slug` and `combined_form_slug` set to NULL, establishing the base rows and their UUIDs.

**Pass 2** runs `UPDATE` statements to back-fill `leader_id` and `combined_form_id` using the now-populated slug→UUID map.

### Purge Mode Safety

The `--purge` flag requires `--confirm` as a second argument to prevent accidental data loss. Truncation follows reverse-FK order (items → appearances → characters → … → continuity_families) to avoid foreign key violations.

### Appearance Slug Selection

Items reference a specific `character_appearance_slug` to indicate which visual representation the toy depicts. This matters when a character's toy differs significantly from their cartoon/media appearance (e.g., G1 Ratchet the ambulance vs cartoon Ratchet the humanoid robot).

---

## Validation & Testing

**Modified:**

- `api/src/db/seed-validation.test.ts` — Updated to reflect:
  - Consolidated character file (single `g1-characters.json` replaces 10 files)
  - New appearance validation checks
  - Updated item file paths (`items/` instead of `manufacturers/`)
  - `character_appearance_slug` FK integrity checks
  - +160 lines changed

---

## Impact Assessment

- **Catalog completeness**: The G1 Transformers catalog now has 439 characters, 439+ appearances, and 395 items (277 Hasbro + 118 FansToys) — covering the foundational generation of the Transformers franchise
- **Seed pipeline**: `npm run seed` provides a one-command path from JSON files to a populated PostgreSQL database, unblocking the Catalog API (Phase 1.5)
- **Data conventions**: Appearance-level item linking establishes the pattern for how the ML photo identification system will map a toy photo to its specific visual variant
- **Developer tooling**: The research-catalog skill codifies the research methodology, making future seed expansion (G2, Beast Wars, etc.) repeatable

---

## Related Files

**Created (8):**

- `api/db/seed/characters/g1-characters.json`
- `api/db/seed/appearances/g1-appearances.json`
- `api/db/seed/items/hasbro/g1-items.json`
- `api/db/seed/ingest.ts`
- `api/tsconfig.seed.json`
- `api/db/migrations/014_add_source_media_check.sql`
- `.claude/skills/research-catalog/SKILL.md`
- `.claude/rules/commit-discipline.md`, `doc-gates-task-integration.md`, `gh-issues-no-auto-close.md`

**Modified (5):**

- `api/db/seed/items/fanstoys/fanstoys.json` (moved from `manufacturers/`, added appearance slugs)
- `api/db/seed/README.md`
- `api/db/schema.sql`
- `api/package.json`
- `api/src/db/seed-validation.test.ts`
- `CLAUDE.md`

**Deleted (10):**

- `api/db/seed/characters/g1-season1.json` through `g1-season4.json`
- `api/db/seed/characters/g1-movie.json`, `g1-toy-only.json`
- `api/db/seed/characters/jp-headmasters.json`, `jp-masterforce.json`, `jp-victory.json`, `jp-zone.json`

---

## Summary Statistics

| Metric                  | Count   |
| ----------------------- | ------- |
| Files created           | 11      |
| Files modified          | 6       |
| Files deleted           | 10      |
| Lines added             | ~19,758 |
| Lines removed           | ~9,219  |
| Net lines added         | ~10,539 |
| Characters consolidated | 439     |
| Appearances added       | 439+    |
| Hasbro G1 items seeded  | 277     |
| FansToys items updated  | 118     |
| Total catalog items     | 395     |
| Ingestion script lines  | 695     |
| Migration added         | 1 (014) |
| npm scripts added       | 3       |
| Claude rules extracted  | 3       |

---

## Status

✅ COMPLETE
