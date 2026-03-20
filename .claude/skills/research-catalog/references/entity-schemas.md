# Entity Schemas Reference

Record formats, valid values, and slug rules for all seed data entities.
Read this file when generating JSON for any entity type.

## Table of Contents

- [Slug Rules](#slug-rules)
- [Characters](#characters)
- [Character Appearances](#character-appearances)
- [Items](#items)
- [Reference Tables](#reference-tables)
  - [Franchises](#franchises)
  - [Continuity Families](#continuity-families)
  - [Factions](#factions)
  - [Sub-Groups](#sub-groups)
  - [Manufacturers](#manufacturers)
  - [Toy Lines](#toy-lines)
- [Valid Enum Values](#valid-enum-values)
- [Metadata Envelope Formats](#metadata-envelope-formats)

---

## Slug Rules

All slugs MUST match: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`

- Lowercase kebab-case only
- Strip apostrophes, periods, parentheses, special characters
- **Characters**: always start with the base name (e.g., `optimus-prime`). Only append a
  continuity suffix if the base slug **already exists** in `existingCharacterSlugs`
  (e.g., `megatron-bw` because `megatron` is already taken by G1 Megatron)
- **Items**: `{product-code-lower}-{character-name}` (e.g., `ft-03-quake-wave`, `05701-bumblebee`)
- **Appearances**: `{character-slug}-{source-descriptor}` (e.g., `optimus-prime-g1-cartoon`)
- **Reference tables**: descriptive name (e.g., `dinobots`, `beast-era`, `fanstoys-mainline`).
  Same collision-first rule applies: only disambiguate on actual collision **within the same
  slug set**. Each table has its own slug set — a sub-group slug `predacons` does NOT collide
  with a faction slug `predacon` because they're different tables. Check `existingFactionSlugs`
  for factions, `existingSubGroupSlugs` for sub-groups, etc.

### Slug scoping

| Entity                | Scope         | Unique constraint                |
| --------------------- | ------------- | -------------------------------- |
| Franchises            | Global        | `(slug)`                         |
| Manufacturers         | Global        | `(slug)`                         |
| Factions              | Per-franchise | `(slug, franchise_id)`           |
| Sub-groups            | Per-franchise | `(slug, franchise_id)`           |
| Continuity families   | Per-franchise | `(slug, franchise_id)`           |
| Toy lines             | Per-franchise | `(slug, franchise_id)`           |
| Characters            | Per-franchise | `(slug, franchise_id)`           |
| Character appearances | Per-character | `(slug, character_id)`           |
| Items                 | Per-franchise | `(slug, franchise_id)`           |

### Cross-continuity disambiguation

**Only disambiguate when there is an actual slug collision in the SAME slug set.** Do NOT
preemptively append continuity suffixes — check the relevant `existing*Slugs` set first.

**Collision checks are per-table.** A sub-group slug `predacons` does NOT collide with a
faction slug `predacon` — they live in different tables with separate uniqueness constraints.
Similarly, a character slug `inferno` does not collide with a faction or sub-group of the
same name.

Decision process:
1. Generate the base slug from the entity name (e.g., `scorponok`)
2. Check if that slug exists in the **correct** slug set for this entity type
   (e.g., `existingCharacterSlugs` for characters, `existingFactionSlugs` for factions)
3. **If no collision in that set**: use the base slug as-is — even if the name appears in
   other tables or continuities, the first one to be seeded gets the base slug
4. **If collision in that set**: append the continuity abbreviation (e.g., `megatron-bw`
   because `megatron` already exists in `existingCharacterSlugs`)

Examples:
- `optimus-primal` — unique name, no suffix needed (no G1 character named "Optimus Primal")
- `predacon` (faction slug) — no suffix needed. The sub-group `predacons` exists but that's
  a different table (`existingSubGroupSlugs`), not `existingFactionSlugs`
- `megatron-bw` — suffix needed because `megatron` already exists in `existingCharacterSlugs` (G1)
- `dinobot-bw` — suffix needed because `dinobot` already exists in `existingCharacterSlugs`
- `scorponok-bw` — suffix needed because `scorponok` already exists in `existingCharacterSlugs`
- `inferno-bw` — suffix needed because `inferno` already exists in `existingCharacterSlugs`

The `existingCharacterKeys` set (name + franchise_slug + continuity_family_slug) prevents
duplicate character entries. The slug must be unique across ALL character files regardless
of franchise.

---

## Characters

**Target file**: `api/db/seed/characters/{continuity-slug}-characters.json`

File naming — one file per continuity family:
- G1: `g1-characters.json`
- Beast Era: `beast-era-characters.json`
- Other: `{continuity-slug}-characters.json`

Characters within a file are ordered by narrative chronology (e.g., S1 → S2 → Movie → S3 → S4
→ toy-only → JP series).

### Record format

```json
{
  "name": "Optimus Prime",
  "character_type": "Transformer",
  "alt_mode": "Freightliner FL86 semi-truck with trailer",
  "is_combined_form": false,
  "combiner_role": null,
  "notes": "Autobot leader. Voiced by Peter Cullen. Killed in the 1986 movie, resurrected in S3",
  "slug": "optimus-prime",
  "faction_slug": "autobot",
  "combined_form_slug": null,
  "sub_group_slugs": [],
  "continuity_family_slug": "g1",
  "franchise_slug": "transformers"
}
```

### Required fields

`name`, `slug`, `franchise_slug`, `continuity_family_slug`, `character_type`, `is_combined_form`

### FK resolution

- `faction_slug` → `factions.slug` (nullable)
- `franchise_slug` → `franchises.slug`
- `continuity_family_slug` → `continuity_families.slug`
- `combined_form_slug` → another character's `slug` (nullable)
- Each entry in `sub_group_slugs[]` → `sub_groups.slug`

### Combiner rules

- Combined forms: `is_combined_form: true`, include `component_slugs` array (reference-only)
- Components: `combined_form_slug` points to the gestalt, `combiner_role` describes their role
- Both the combined form and all components MUST appear in the SAME file
- Bidirectional: components point to form via `combined_form_slug`, form lists components via `component_slugs`

**Combiners are NOT sub-groups.** Combiner teams (e.g., Magnaboss, Tripredacus, Superion) are
modeled via the `is_combined_form` / `combined_form_slug` / `component_slugs` / `combiner_role`
fields on character records. Do NOT create sub-group entries for combiner teams. Sub-groups are
for named teams that are NOT defined by combining (e.g., Dinobots, Aerialbots as a team, Minibots).
The existing `predacons` and `aerialbots` sub-groups represent the team identity, not the
combining relationship — the combining is handled by character fields.

### Name uniqueness

The tuple `(name.toLowerCase(), franchise_slug, continuity_family_slug)` must be globally unique
across all character files.

---

## Character Appearances

**Target file**: `api/db/seed/appearances/{continuity-slug}-appearances.json`

File naming — one file per continuity family (combined, not per-media-type):
- G1: `g1-appearances.json`
- Beast Era: `beast-era-appearances.json`
- Other: `{continuity-slug}-appearances.json`

Appearances within a file are ordered to match their character file's chronological order.

### Record format

```json
{
  "slug": "optimus-prime-g1-cartoon",
  "name": "Optimus Prime (G1 Cartoon)",
  "character_slug": "optimus-prime",
  "description": "Tall, broad-shouldered red and blue robot with iconic silver faceplate and blue eyes. Transforms into a red Freightliner FL86 cab-over-engine semi-truck with gray trailer",
  "source_media": "TV",
  "source_name": "The Transformers Season 1",
  "year_start": 1984,
  "year_end": 1985,
  "metadata": {}
}
```

### Required fields

`slug`, `name`, `character_slug`, `source_media`, `source_name`

### FK resolution

- `character_slug` → `characters.slug` (must already exist in seed data)

### Description writing

Descriptions should be factual visual descriptions of the character's design in that specific
media appearance. Derive from: alt_mode, faction colors, distinctive design features, and
well-established character design knowledge. These are descriptions of well-documented fictional
character designs, not fabricated data.

---

## Items

**Target file**: `api/db/seed/items/{manufacturer-slug}/{continuity-family-or-line}.json`

### Record format

```json
{
  "product_code": "05701",
  "name": "Bumblebee",
  "slug": "05701-bumblebee",
  "character_slug": "bumblebee",
  "character_appearance_slug": "bumblebee-g1-cartoon",
  "year_released": 1984,
  "is_third_party": false,
  "size_class": null,
  "manufacturer_slug": "hasbro",
  "toy_line_slug": "the-transformers-g1",
  "metadata": {
    "status": "released",
    "variant_type": null,
    "base_product_code": null,
    "sub_brand": "The Transformers",
    "notes": "Series 1 Mini Vehicle. Micro Change MC-04 Mini CAR Robo mold. Yellow Volkswagen Beetle"
  }
}
```

### Required fields

`name`, `slug`, `product_code`, `character_slug`, `manufacturer_slug`, `toy_line_slug`,
`is_third_party`, `metadata` (must be an object, even if `{}`)

### Forbidden fields

NEVER include integer ID fields: `manufacturer_id`, `toy_line_id`, `character_id`,
`character_faction_id`, `character_sub_group_id`

### FK resolution

- `character_slug` → `characters.slug` (**NOT nullable** — every item must have a character)
- `character_appearance_slug` → `character_appearances.slug` (nullable)
- `manufacturer_slug` → `manufacturers.slug`
- `toy_line_slug` → `toy_lines.slug`

### Complete chain rule

**Every item requires a complete character → appearance → item chain.** If you generate an item
for a character that doesn't exist in seed data, you MUST also generate:

1. A **character record** in the appropriate character file
2. At minimum a **`Toy-only` appearance** with `source_media: "Toy-only"` and
   `source_name: "{Toy Line Name}"` (e.g., "Beast Wars Transformers Toy Line")

The existing G1 data follows this pattern exactly: 440 characters, 508 appearances (161 are
`Toy-only`), 277 items — zero null `character_slug` values. Toy-only characters (those with
no cartoon/comic appearance) still get a character record and a `Toy-only` appearance.

Do NOT generate items with null `character_slug`. If you can't create the character record
in the same batch, move the item to `_metadata.unresolved_characters` and skip it.

### Appearance slug selection for items

| Item type | Appearance to use |
| --- | --- |
| Third-party standard (cartoon-accurate MP) | `{char}-g1-cartoon` |
| Third-party "Toy Deco" variant | `{char}-g1-toy` |
| Original Hasbro G1 toy (1984-1990) | `{char}-g1-toy` if it exists (livery divergence), else `{char}-g1-cartoon` |
| Action Masters (non-transforming) | `{char}-g1-cartoon` (always) |
| Legends / simplified reissues | `{char}-g1-cartoon` |
| JP-only characters | `{char}-jp-headmasters`, `{char}-jp-masterforce`, or `{char}-jp-victory` |

### Multi-character products

Schema requires exactly one `character_slug` per item:
- **Cassette 2-packs**: first-listed character as `character_slug`, second in `metadata.notes`
- **Combiner giftsets**: combined form's `character_slug`
- **2-pack slug**: `{code}-{char1}-and-{char2}` (e.g., `05731-ravage-and-rumble`)

### Official Hasbro G1 items (1984-1990)

- `is_third_party`: always `false`
- `size_class`: always `null` (predates modern size classes)
- `manufacturer_slug`: `"hasbro"`
- `toy_line_slug`: `"the-transformers-g1"`
- `metadata.sub_brand`: `"The Transformers"`
- Product codes: 5-digit Hasbro numbers from TFArchive. When only assortment codes available,
  note in metadata. When undocumented, use `"UNKNOWN"` with `hasbro-{name}-g1` slug format.

---

## Reference Tables

### Franchises

```json
{
  "name": "Transformers",
  "slug": "transformers",
  "sort_order": 1,
  "notes": "Hasbro/Takara Tomy transforming robot franchise..."
}
```

Fields: `name`, `slug`, `sort_order` (nullable), `notes` (nullable)

### Continuity Families

```json
{
  "name": "Generation 1",
  "slug": "g1",
  "sort_order": 10,
  "notes": "Original 1984 continuity family...",
  "franchise_slug": "transformers"
}
```

Fields: `name`, `slug`, `sort_order` (nullable), `notes` (nullable), `franchise_slug`

### Factions

```json
{
  "name": "Autobot",
  "slug": "autobot",
  "franchise_slug": "transformers",
  "notes": "Heroic faction. Known as Cybertrons in Japan"
}
```

Fields: `name`, `slug`, `franchise_slug`, `notes` (nullable)

### Sub-Groups

```json
{
  "name": "Dinobots",
  "slug": "dinobots",
  "notes": "Autobot sub-team with dinosaur alt modes...",
  "faction_slug": "autobot",
  "franchise_slug": "transformers"
}
```

Fields: `name`, `slug`, `notes` (nullable), `faction_slug` (nullable — null for cross-faction groups), `franchise_slug`

### Manufacturers

```json
{
  "name": "FansToys",
  "slug": "fanstoys",
  "is_official_licensee": false,
  "country": "China",
  "website_url": null,
  "aliases": ["FT", "Fans Toys", "Fan's Toys"],
  "notes": "Third-party Masterpiece-scale manufacturer..."
}
```

Fields: `name`, `slug`, `is_official_licensee`, `country` (nullable), `website_url` (nullable),
`aliases` (array, default `[]`), `notes` (nullable)

Manufacturer slugs are **globally unique** (not franchise-scoped).

### Toy Lines

```json
{
  "name": "FansToys Mainline",
  "slug": "fanstoys-mainline",
  "scale": "Masterpiece",
  "description": "Primary FT-numbered product line",
  "manufacturer_slug": "fanstoys",
  "franchise_slug": "transformers"
}
```

Fields: `name`, `slug`, `scale` (nullable), `description` (nullable), `manufacturer_slug`, `franchise_slug`

---

## Valid Enum Values

### character_type (non-exhaustive — research the correct term)

`Transformer`, `Human`, `Mini-Con`, `Predacon`, `Maximal`, `Vehicon`, `Spark`,
`Pretender`, `Headmaster`, `Targetmaster`, `Powermaster`, `Actionmaster`,
`Micromaster`, `Quintesson`, `Nebulan`, `Junkion`, `Lithone`, `Brainmaster`,
`Godmaster`, `Sharkticon`, `Other`

### combiner_role

`torso`, `right arm`, `left arm`, `right leg`, `left leg`,
`upper torso`, `lower torso`, `upper body`, `lower body`,
`torso (right half)`, `torso (left half)`,
`main body`, `wings/booster`, `weapon`, `back-mounted weapon`, `back`

### source_media (DB CHECK constraint)

`TV`, `Comic/Manga`, `Movie`, `OVA`, `Toy-only`, `Video Game`

### metadata.status (items)

`released`, `pre-order`, `announced`, `unannounced`, `cancelled`, `in_development`

### size_class (collector convention, nullable for vintage)

`Masterpiece`, `Voyager`, `Deluxe`, `Leader`, `Commander`, `Titan`,
`Legends`, `Scout`, `Basic`, `Ultra`, `Supreme`, `Core`

### Continuity family slug mapping

| User says | continuity_family_slug |
| --- | --- |
| G1, Generation 1, Season 1-4, The Movie | `g1` |
| Beast Wars, Beast Machines | `beast-era` |
| Armada, Energon, Cybertron | `unicron-trilogy` |
| Bay movies, live-action | `movieverse` |
| Animated | `animated` |
| Prime, War for Cybertron, Rescue Bots | `aligned` |
| Cyberverse | `cyberverse` |
| EarthSpark | `earthspark` |
| Transformers One | `one` |
| RiD 2001, Car Robots | `robots-in-disguise-2001` |

---

## Metadata Envelope Formats

### Character files

```json
{
  "_metadata": {
    "description": "{continuity} characters — {scope description}",
    "total_characters": 0
  },
  "characters": []
}
```

Count field: `total_characters`

### Appearance files

```json
{
  "_metadata": {
    "description": "Character appearance seed data for {source description}",
    "total": 0
  },
  "data": []
}
```

Count field: `total`

### Item files

```json
{
  "_metadata": {
    "description": "{Manufacturer} items seed data — {scope}",
    "generated": "{ISO timestamp}",
    "total_items": 0,
    "unresolved_characters": [],
    "schema_target": "items table from migrations 011 + 013",
    "import_instructions": [
      "1. Ensure reference tables, characters, appearances are seeded",
      "2. For each item: resolve slug FKs to UUIDs",
      "3. Insert into items table",
      "4. metadata JSONB holds: status, variant_type, base_product_code, sub_brand, notes"
    ],
    "stats": {},
    "fk_convention": "slug-based — see api/db/seed/README.md"
  },
  "items": []
}
```

Count field: `total_items`

### Reference table files

```json
{
  "_metadata": {
    "table": "{table_name}",
    "description": "Seed data for the {table_name} table",
    "total": 0,
    "import_order": 0,
    "references": ["{related_table} (via {fk_column})"]
  },
  "data": []
}
```

Count field: `total`

Import order: franchises (-1) → continuity_families (0) → factions (1) → sub_groups (2) →
manufacturers (3) → toy_lines (4) → characters (5) → appearances (5.5) → items (6)
