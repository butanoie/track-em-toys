# Continuity Families, Character Appearances, and Size Class

**Date:** 2026-03-16
**Scope:** api (schema, seed data, types, tests)
**Migration:** 013_continuity_families_and_appearances.sql

## Summary

Normalized the free-text `series` and `continuity` columns on `characters` into a proper `continuity_families` reference table. Added `character_appearances` table for tracking how a character looks in different media (e.g., G1 cartoon Optimus vs IDW comic Optimus). Added `size_class` to `items` for toy size classification.

## Changes

### New Tables

- **`continuity_families`** — Reference table (10 entries: G1, Beast Era, Unicron Trilogy, Live-Action Movies, Animated, Aligned/Prime, Cyberverse, EarthSpark, Transformers One, Robots in Disguise 2001). The identity boundary for characters — same name in different families = different character.
- **`character_appearances`** — Editable entity tracking a character's visual depiction in specific media. Items optionally link to an appearance via `character_appearance_id`.

### Modified Tables

- **`characters`** — Added `continuity_family_id UUID NOT NULL FK → continuity_families`. Dropped `series` and `continuity` TEXT columns. Replaced unique index with `(lower(name), lower(franchise), continuity_family_id)`.
- **`items`** — Added nullable `character_appearance_id UUID FK → character_appearances` and nullable `size_class TEXT`.

### Seed Data

- New: `api/db/seed/reference/continuity_families.json` (10 families)
- Updated: All 10 character seed files — added `continuity_family_slug: "g1"`, kept `series`/`continuity` as reference-only fields

### Types

- Added `ContinuityFamily` and `CharacterAppearance` interfaces
- Updated `Character` (removed `series`/`continuity`, added `continuity_family_id`)
- Updated `Item` (added `character_appearance_id`, `size_class`)

### Tests

- 490 tests passing (up from 477)
- Added continuity families to all reference table validation loops
- Added `continuity_family_slug` FK integrity test
- Updated uniqueness test to use `continuity_family_slug`

### Documentation

- Updated `docs/decisions/Schema_Design_Rationale.md` — new sections 3a (continuity families), 3b (character appearances), 3c (size class)
- Updated `docs/diagrams/toy-catalog-database-diagrams.jsx` — new table cards and relationships
- Updated `api/db/seed/README.md` — import order and column mapping

## Design Decisions

- **Continuity family as identity boundary:** A character is one entity per continuity family. G1 Megatron and Beast Wars Megatron are separate characters. G1 cartoon Megatron and G1 Marvel comic Megatron are the same character with different appearances.
- **G1 is the mega-family:** Absorbs G2, Beast Wars narrative threads that share characters, all comic publishers, Japanese series, Binaltech, and Classics.
- **Beast Era is separate:** Beast Wars reuses G1 character names for entirely different characters.
- **`character_appearances` not seeded yet:** Table exists in schema, ready for population when comic/movie data arrives.
- **`size_class` as TEXT:** Not an enum — size classes evolve over time and vary by manufacturer.

## Future Work

- Seed `character_appearances` data for G1 cartoon, G1 Marvel comics, etc.
- Add comic book character seed data (now supported by the schema)
- Consider mold relationship tracking on items (redeco/retool)
