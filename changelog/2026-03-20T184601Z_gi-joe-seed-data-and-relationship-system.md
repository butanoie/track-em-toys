# GI Joe Seed Data & Entity Relationship System

**Date:** 2026-03-20
**Time:** 18:46:01 UTC
**Type:** Feature
**Phase:** 1.4 Seed
**Version:** v0.4.0

## Summary

Added comprehensive GI Joe franchise seed data spanning 5 continuity families with 313 characters, 193 vehicles, and 382 appearances. Replaced the domain-specific combiner fields (`combined_form_slug`, `combiner_role`, `component_slugs`) with a general-purpose typed relationship system supporting 7 relationship types across 245 migrated records. Also expanded Transformers seed data with 5 additional continuities (Aligned, Animated, Movieverse, Unicron Trilogy, RiD 2001).

---

## Changes Implemented

### 1. GI Joe Reference Data

Added franchise-level reference data for GI Joe:

- 5 continuity families: ARAH (1982-1994), Sigma 6 (2005-2007), Resolute (2009), Renegades (2010-2011), GI Joe Movies (2009-2021)
- 3 factions: Oktober Guard, Cobra-La, Civilian
- 20 sub-groups: Tiger Force, Night Force, Dreadnoks, Crimson Guard, Iron Grenadiers, Python Patrol, Battle Force 2000, Star Brigade, and more
- 1 toy line: GI Joe Classified Series

**Modified:**

- `api/db/seed/reference/continuity_families.json` (+5 entries)
- `api/db/seed/reference/factions.json` (+3 entries)
- `api/db/seed/reference/sub_groups.json` (+20 entries)
- `api/db/seed/reference/toy_lines.json` (+1 entry)

### 2. GI Joe Characters & Vehicles

313 named characters across 4 files plus 193 vehicles across 2 files:

- **ARAH GI Joe team**: 153 characters (Original 13 through 1994 Star Brigade)
- **ARAH Cobra/villains**: 110 characters (Cobra, Dreadnoks, Iron Grenadiers, Oktober Guard, Cobra-La)
- **Sigma 6**: 45 characters (anime-proportioned redesigns — separate records from ARAH)
- **GI Joe Movies**: 5 movie-original characters (shared-slug ARAH characters get appearance records only)
- **GI Joe vehicles**: 122 Joe vehicles + 71 Cobra vehicles, modeled as `character_type: "Vehicle"`

Vehicle-crew relationships use `component_slugs` on vehicles (now migrated to relationship system).

**Created:**

- `api/db/seed/characters/arah-gi-joe-characters.json` (153 characters)
- `api/db/seed/characters/arah-cobra-characters.json` (110 characters)
- `api/db/seed/characters/arah-gi-joe-vehicles.json` (122 vehicles)
- `api/db/seed/characters/arah-cobra-vehicles.json` (71 vehicles)
- `api/db/seed/characters/sigma-6-characters.json` (45 characters)
- `api/db/seed/characters/gi-joe-movieverse-characters.json` (5 characters)

### 3. GI Joe Appearances

382 appearance records across 6 files covering cartoon, toy-only, and media-specific visual depictions:

- ARAH GI Joe team: 153 appearances (77 TV Sunbow/DIC, 76 toy-only)
- ARAH Cobra: 110 appearances (33 TV Sunbow, 6 TV DIC, 3 Movie, 68 toy-only)
- Sigma 6: 45 appearances (29 TV anime, 16 toy-only)
- Resolute: 20 appearances (shared ARAH character slugs)
- Renegades: 23 appearances (shared ARAH character slugs)
- GI Joe Movies: 31 appearances (across Rise of Cobra, Retaliation, Snake Eyes)
- Vehicle appearances: 122 Joe + 71 Cobra (25 Joe TV + 19 Cobra TV, rest toy-only)

**Created:**

- `api/db/seed/appearances/arah-gi-joe-appearances.json`
- `api/db/seed/appearances/arah-cobra-appearances.json`
- `api/db/seed/appearances/arah-gi-joe-vehicle-appearances.json`
- `api/db/seed/appearances/arah-cobra-vehicle-appearances.json`
- `api/db/seed/appearances/sigma-6-appearances.json`
- `api/db/seed/appearances/resolute-appearances.json`
- `api/db/seed/appearances/renegades-appearances.json`
- `api/db/seed/appearances/gi-joe-movieverse-appearances.json`

### 4. Entity Relationship System (#80)

Replaced inline combiner/vehicle fields with a general-purpose typed relationship system.

**Old model (removed):**
- `combined_form_slug` (single value, 1:1 — couldn't express many-to-many)
- `combiner_role` (domain-specific role string)
- `component_slugs` (informational reverse list on gestalts/vehicles)

**New model:**
- Separate relationship files in `api/db/seed/relationships/`, auto-discovered via glob
- Each record: `{ type, subtype, entity1: { slug, role }, entity2: { slug, role }, metadata }`
- One record per pair (uniform shape — 5-member combiner = 5 records)
- Single source of truth (no dual-declaration sync issues)

**Relationship types:**

| Type | Subtypes | Use case |
|------|----------|----------|
| `combiner-component` | — | Transformers combiners (gestalt + body-part roles) |
| `binary-bond` | headmaster, targetmaster, powermaster, brainmaster, godmaster | TF binary-bonding partnerships (type defined, data deferred) |
| `vehicle-crew` | packaged-with, media-assigned | GI Joe vehicle-pilot/driver assignments |
| `rival` | — | Nemesis pairs (type defined, data deferred) |
| `sibling` | twin, clone | Twin/clone pairs (type defined, data deferred) |
| `mentor-student` | — | Training relationships (type defined, data deferred) |
| `evolution` | upgrade, reformatting, reconstruction | Character form changes (type defined, data deferred) |

**Migration:** 245 relationships extracted from character records with zero data loss. Python migration script (`api/db/seed/scripts/migrate-to-relationships.py`) handles extraction and field stripping in two idempotent phases.

**Created:**

- `api/db/seed/relationships/g1-relationships.json` (94 relationships)
- `api/db/seed/relationships/beast-era-relationships.json` (17)
- `api/db/seed/relationships/unicron-trilogy-relationships.json` (27)
- `api/db/seed/relationships/robots-in-disguise-2001-relationships.json` (14)
- `api/db/seed/relationships/aligned-relationships.json` (16)
- `api/db/seed/relationships/animated-relationships.json` (2)
- `api/db/seed/relationships/movieverse-relationships.json` (7)
- `api/db/seed/relationships/arah-relationships.json` (68)
- `api/db/seed/scripts/migrate-to-relationships.py`

**Modified:**

- `api/db/seed/characters/g1-characters.json` (stripped old fields, fixed Slamdance/Squawkbox component data)
- `api/db/seed/characters/beast-era-characters.json` (stripped old fields)
- All other character files (stripped old fields via migration script)

### 5. Validation Test Updates

Comprehensive relationship validation added to `seed-validation.test.ts`:

- Auto-discovery of relationship files (glob pattern matching appearances)
- Per-type role validation via structured `RELATIONSHIP_TYPE_REGISTRY` map
- Subtype validation (required for binary-bond, optional for vehicle-crew/sibling/evolution)
- Symmetric type ordering enforcement (entity1.slug < entity2.slug alphabetically)
- Uniqueness: no duplicate `(type, entity1.slug, entity2.slug)` tuples
- Component uniqueness: each entity2 in at most one combiner
- Cross-validation: `is_combined_form` flag ↔ combiner-component relationships (bidirectional)
- Vehicle-crew: entity1 must have `character_type: "Vehicle"`

Removed old combiner/vehicle consistency tests (section 5).

**Modified:**

- `api/src/db/seed-validation.test.ts`

### 6. Documentation Updates

- `.claude/skills/research-catalog/references/entity-schemas.md` — new Character Relationships section, removed old combiner fields from character schema, updated enum values and metadata envelopes
- `api/db/seed/README.md` — added relationships to import order (5.7), removed old column mappings

---

## Technical Details

### Relationship Record Schema

```json
{
  "type": "combiner-component",
  "subtype": null,
  "entity1": { "slug": "superion", "role": "gestalt" },
  "entity2": { "slug": "air-raid", "role": "right leg" },
  "metadata": {}
}
```

### Vehicle Character Model

GI Joe vehicles are modeled as characters with `character_type: "Vehicle"` and `alt_mode` describing the vehicle type. Vehicle-crew relationships are in the relationship system.

### Pre-existing Data Fixes

- Slamdance/Squawkbox components (Grand Slam, Raindance, Beastbox, Squawktalk) — added missing `combined_form_slug` before migration
- Dragonstorm-mv — set `is_combined_form: false` (no component data)
- Unicron Trilogy name collisions (Downshift, Inferno, Mirage — Armada vs Energon same-name characters)

---

## Validation & Testing

```
Test Files  1 passed (1)
     Tests  353 passed (353)
```

Full API test suite: 910 tests passed across 30 test files.

---

## Impact Assessment

- Seed data now spans 2 franchises (Transformers + GI Joe) with 1,400+ characters
- Relationship system eliminates the 1:1 combiner limitation — supports many-to-many (e.g., Ace crews 3 aircraft)
- Framework ready for future relationship types without schema changes
- Decision made to extract seed data to separate repo for proprietary licensing (tracked in memory)

---

## Related Files

42 files changed: 28,855 insertions, 1,363 deletions

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| New character files | 6 |
| New vehicle files | 2 |
| New appearance files | 8 |
| New relationship files | 8 |
| Total GI Joe characters | 313 |
| Total GI Joe vehicles | 193 |
| Total GI Joe appearances | 382 |
| Migrated relationships | 245 |
| Relationship types defined | 7 |
| Fields stripped from character records | 3,282 |

---

## Next Steps

- Extract seed data to separate private repository (different licensing)
- Populate binary-bond relationship data (46+ Headmaster/Targetmaster/Powermaster partnerships)
- Add rival/sibling/mentor-student relationship data
- GI Joe Classified Series items (toy line created, item research deferred)
- DB migration + ingest.ts updates for relationship tables (Phase 6)
- Remaining Transformers continuities: Cyberverse, EarthSpark, Transformers One

---

## Status

✅ COMPLETE
