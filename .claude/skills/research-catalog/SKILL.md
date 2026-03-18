---
name: research-catalog
description: Research Transformers toy and character data from web sources and generate seed JSON files for the PostgreSQL catalog. Handles characters, items, reference data, and character appearances.
---

# Research Catalog

Research Transformers data from authoritative web sources and produce seed JSON files that
pass `api/src/db/seed-validation.test.ts` without modification.

## Step 1 — Classify the Request

Read the user's request and determine which category applies. A single request may
span multiple categories (e.g., "add Beast Wars characters and their appearances").

| Category        | Trigger phrases                                                                             | Target files                                       |
| --------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **characters**  | "add X characters", "add the Stunticons", "add Beast Wars cast"                             | `api/db/seed/characters/{file}.json`               |
| **items**       | "add X-Transbots items", "add FansToys", "add Hasbro G1 items"                              | `api/db/seed/items/{mfr}/{continuity-family}.json` |
| **reference**   | "add faction", "add sub-group", "add continuity family", "add manufacturer", "add toy line" | `api/db/seed/reference/{table}.json`               |
| **appearances** | "add appearances", "add character appearances", explicit "appearances"                      | `api/db/seed/appearances/{source}.json`            |

When the request includes characters, also generate appearances for those characters unless
the user says otherwise.

If the category is ambiguous, ask the user one clarifying question before proceeding.

## Step 2 — Load Existing Seed Data

Before any research, read the current seed state to build duplicate-detection sets.

### 2a — Always load ALL reference tables

Read these files using the Read tool:

- `/Users/buta/Repos/track-em-toys/api/db/seed/reference/continuity_families.json`
- `/Users/buta/Repos/track-em-toys/api/db/seed/reference/factions.json`
- `/Users/buta/Repos/track-em-toys/api/db/seed/reference/sub_groups.json`
- `/Users/buta/Repos/track-em-toys/api/db/seed/reference/manufacturers.json`
- `/Users/buta/Repos/track-em-toys/api/db/seed/reference/toy_lines.json`

### 2b — Load all character files

```bash
ls /Users/buta/Repos/track-em-toys/api/db/seed/characters/
```

For **appearance-only** requests targeting a specific character file, read only that file
(you need the full character records for descriptions). For all other requests, read every
character file listed. Build these sets in working memory:

- `existingCharacterSlugs` — all slugs across all character files
- `existingCharacterKeys` — `name.toLowerCase() + "|||" + franchise.toLowerCase() + "|||" + continuity_family_slug` for each character

For slug-set building when you don't need full records, extract slugs efficiently:

```bash
cd /Users/buta/Repos/track-em-toys/api/db/seed/characters && python3 -c "
import json, glob
slugs = set()
for f in sorted(glob.glob('*.json')):
    data = json.load(open(f))
    for c in data['characters']:
        slugs.add(c['slug'])
print(f'{len(slugs)} character slugs loaded')
for s in sorted(slugs): print(s)
" 2>&1 | head -5
```

### 2c — Load all item files

```bash
find /Users/buta/Repos/track-em-toys/api/db/seed/items -name '*.json' -type f
```

Read every item file found. Build `existingItemSlugs` set.

### 2d — Load all appearance files

```bash
ls /Users/buta/Repos/track-em-toys/api/db/seed/appearances/ 2>/dev/null || echo "(empty)"
```

Read any appearance files found. Build `existingAppearanceSlugs` set.

### 2e — Build reference slug sets

From the reference files, build: `existingFactionSlugs`, `existingSubGroupSlugs`,
`existingContinuityFamilySlugs`, `existingManufacturerSlugs`, `existingToyLineSlugs`.

## Step 3 — Research Phase

Choose the appropriate research strategy based on what you're generating:

### 3a — Appearances for existing characters (no web research needed)

When generating appearances for characters that already exist in seed data, the character
records themselves contain everything needed: name, alt_mode, faction, character_type, and
sub_group membership. Use this data plus well-established design knowledge to write visual
descriptions. Do NOT waste time fetching TFWiki pages for appearance-only requests.

For bulk appearance generation (e.g., "add G1 cartoon appearances for all Season 1
characters"), use a batch extraction approach:

```bash
cat /Users/buta/Repos/track-em-toys/api/db/seed/characters/{file}.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data['characters']:
    print(f\"{c['slug']}|{c['name']}|{c['character_type']}|{c.get('alt_mode') or 'null'}|{c.get('faction_slug') or 'null'}|{c.get('is_combined_form', False)}\")
"
```

This gives you everything needed to write accurate descriptions without web fetches.

### 3b — New characters and items (web research required)

#### Primary source: tfwiki.net (characters and character data)

For new characters or items, attempt a targeted fetch first:

```
https://tfwiki.net/wiki/{EntityName}
```

Use title-case with underscores for spaces: `Optimus_Prime`, `Stunticons`, `Beast_Wars`.

For disambiguation pages, append the continuity family abbreviation in parentheses:
`https://tfwiki.net/wiki/Optimus_Prime_(G1)`,
`https://tfwiki.net/wiki/Megatron_(BW)`.

**URL caveats (from smoke testing):**

- Subpage paths like `/cartoon`, `/toys` return 404 — use only the main page URL.
- TFWiki articles are narrative-focused (plot summaries), not visual-description-focused.
  Visual design info is in images, not text. Do not rely on TFWiki for appearance
  descriptions — use the character's alt_mode and faction to compose descriptions instead.

Extract from tfwiki pages:

- **Characters**: faction, alt mode, first appearance episode/issue, sub-group membership,
  combiner role, combined form, continuity family, character type
- **Items**: product code, release year, size class, character depicted, toy line

**IMPORTANT**: TFWiki documents **Takara** catalog numbers, NOT Hasbro product codes.
Do NOT use TFWiki as a source for Hasbro item/stock numbers.

#### Primary source: TFArchive (Hasbro product codes)

For Hasbro item/stock numbers, fetch:

```
https://www.tfarchive.com/toys/references/product_code_numbers.php
```

This page has comprehensive Hasbro 5-digit product codes organized by year (1984-1993).
Extract the product codes for the specific years you need.

**TFArchive caveats:**

- Sections are organized by product code assignment year, which may not match retail
  availability (e.g., Blaster cassettes coded in 1985 but shipped in 1986).
- Some items only have assortment-level codes (shared by multiple characters in a shipping
  case), not individual item numbers. Flag these in metadata notes.
- Major items like Fortress Maximus, Trypticon, and some combiner giftsets may be missing.
  Use assortment codes when available, or `"UNKNOWN"` with `hasbro-{name}-g1` slug format.
- 1990 Action Master codes **reuse** the same 057xx range as 1984 items. Slugs disambiguate
  via character name (e.g., `05751-sunstreaker` vs `05751-wheeljack-action-master`).

#### Fallback: web search

If a tfwiki page is missing or sparse, run a web search:

- Characters: `"{CharacterName}" Transformers {continuity} character faction alt-mode site:tfwiki.net`
- Items: `"{ManufacturerName}" "{ProductCode}" third party Transformers masterpiece`
- For manufacturer items, also search the manufacturer's official product page and fan
  databases (TFW2005.com, Seibertron.com)
- For Hasbro product codes: search TFArchive or collector databases

#### Parallel fetch for bulk requests

When the request involves 3 or more independent entities (e.g., "add all Beast Wars
Maximals"), use the Agent tool to spawn parallel fetch sub-agents — one per character
or small batch — with `WebFetch` and `WebSearch` tools. Each sub-agent returns a
structured data block. Collect all results before proceeding to generation.

For 1-2 entities, fetch inline without spawning sub-agents.

### 3c — Research discipline

- Record your source URL for every data point when web-fetching.
- When two sources conflict, flag the conflict in the `notes` field:
  `"UNCERTAIN: tfwiki says X, TFW2005 says Y"`.
- For release years: use the first mass-retail release date.
- Never fabricate data you cannot source. If a data point cannot be confirmed, set it to
  `null` and add a note.
- For appearance descriptions: derive from the character's known alt_mode, faction colors,
  and distinctive design features. These are factual descriptions of well-documented
  fictional character designs, not fabricated data.

## Step 4 — Generate JSON

### 4a — Slug generation rules

Slugs MUST match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`:

- Lowercase, kebab-case
- Strip apostrophes, periods, parentheses, special characters
- For characters: use the character name (e.g., `optimus-prime`)
- For items: `{product-code-lower}-{character-name}` (e.g., `ft-03-quake-wave`)
- For appearances: `{character-slug}-{source-descriptor}` (e.g., `optimus-prime-g1-cartoon`)
- For cross-continuity slug collisions: append continuity abbreviation
  (e.g., `megatron-bw` for Beast Wars Megatron)

Verify against `existingCharacterSlugs` / `existingItemSlugs` / `existingAppearanceSlugs`
before use. If a collision is found, flag it and ask the user how to resolve.

### 4b — Characters format

Target file: `api/db/seed/characters/{continuity-source}.json`

File naming convention — one file per continuity family:

- G1: `g1-characters.json` (all NA cartoon, movie, toy-only, and JP series characters)
- Beast Era: `beast-era-characters.json`
- Other continuities: `{continuity-slug}-characters.json` (e.g., `animated-characters.json`)

Characters within a file are ordered by narrative chronology (e.g., NA S1 → S2 → Movie →
S3 → S4 → toy-only → JP series). New characters are appended at the appropriate
chronological position, not at the end of the array.

Each character record:

```json
{
  "name": "Optimus Primal",
  "character_type": "Transformer",
  "alt_mode": "Western gorilla",
  "is_combined_form": false,
  "combiner_role": null,
  "first_appearance": "S1E01 Beast Wars Part 1",
  "first_appearance_season": 1,
  "notes": "Maximal commander. Voiced by Garry Chalk",
  "slug": "optimus-primal",
  "franchise": "Transformers",
  "faction_slug": "maximal",
  "combined_form_slug": null,
  "series": "Beast Wars: Transformers Season 1",
  "continuity": "Beast Era",
  "sub_group_slugs": [],
  "continuity_family_slug": "beast-era"
}
```

File envelope:

```json
{
  "_metadata": {
    "description": "{Source} character catalog — NEW characters only",
    "generated": "{ISO timestamp from date '+%Y-%m-%dT%H%M%S'}",
    "total_characters": 0,
    "scope": "{Description of what's included and excluded}",
    "schema_target": "characters table from migration 011_shared_catalog_tables.sql",
    "table": "characters",
    "import_order": 5,
    "references": [
      "factions (via faction_slug)",
      "sub_groups (via sub_group_slugs)",
      "characters (via combined_form_slug for combiners)",
      "continuity_families (via continuity_family_slug)"
    ]
  },
  "characters": []
}
```

Rules:

- `faction_slug` MUST resolve to `existingFactionSlugs`. If not, generate reference data first (Step 4e).
- `continuity_family_slug` MUST resolve to `existingContinuityFamilySlugs`. Same rule.
- Every slug in `sub_group_slugs` MUST resolve to `existingSubGroupSlugs`.
- `series` and `continuity` are reference-only (not seeded to DB per migration 013).
  Include for human readability.
- `component_slugs` on combined forms is reference-only; include for documentation.
- For combiners: include the combined form (`is_combined_form: true`) and all components
  in the SAME file. Each component's `combined_form_slug` points to the gestalt's slug.
- Do NOT duplicate characters in `existingCharacterSlugs` or `existingCharacterKeys`.

### Valid combiner_role values

`torso`, `right arm`, `left arm`, `right leg`, `left leg`,
`upper torso`, `lower torso`, `upper body`, `lower body`,
`torso (right half)`, `torso (left half)`,
`main body`, `wings/booster`, `weapon`, `back-mounted weapon`, `back`

### 4c — Items format

Target file: `api/db/seed/items/{manufacturer-slug}/{continuity-family}.json`

Each item record:

```json
{
  "product_code": "FT-03",
  "name": "Quake Wave",
  "slug": "ft-03-quake-wave",
  "character_slug": "shockwave",
  "character_appearance_slug": "shockwave-g1-cartoon",
  "year_released": 2014,
  "is_third_party": true,
  "size_class": "Masterpiece",
  "manufacturer_slug": "fanstoys",
  "toy_line_slug": "fanstoys-mainline",
  "metadata": {
    "status": "released",
    "variant_type": null,
    "base_product_code": null,
    "sub_brand": "FansToys",
    "notes": null
  }
}
```

Rules:

- `character_slug` MUST resolve to `existingCharacterSlugs`. If not, add to
  `_metadata.unresolved_characters` and flag for the user.
- `character_appearance_slug` is optional (nullable). When set, MUST resolve to
  `existingAppearanceSlugs`. Use the appearance that matches the toy's depicted design
  (e.g., `shockwave-g1-cartoon` for a Masterpiece G1-style Shockwave). Set to `null`
  when the item doesn't represent a specific media depiction.
- `manufacturer_slug` and `toy_line_slug` MUST resolve. Generate reference data first if needed.
- NEVER use integer FK fields (`manufacturer_id`, `toy_line_id`, `character_id`,
  `character_appearance_id`).
- For variants: set `metadata.variant_type` and `metadata.base_product_code`.

### Appearance slug selection for items

Choose the appearance that best matches what the physical toy depicts:

| Item type                                         | Appearance to use                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Third-party standard (cartoon-accurate MP)        | `{char}-g1-cartoon`                                                               |
| Third-party "Toy Deco" variant                    | `{char}-g1-toy`                                                                   |
| Original Hasbro G1 toy (1984-1990)                | `{char}-g1-toy` if it exists (livery/design divergence), else `{char}-g1-cartoon` |
| Action Masters (non-transforming, cartoon design) | `{char}-g1-cartoon` (always, even though they're 1990 items)                      |
| Legends / simplified reissues                     | `{char}-g1-cartoon` (depict simplified cartoon designs)                           |
| Targetmaster/Powermaster reissues                 | Same as base item (toy is identical with added partner)                           |
| Characters only animated in JP series             | `{char}-jp-headmasters`, `{char}-jp-masterforce`, or `{char}-jp-victory`          |

**Key characters with significant toy-vs-cartoon livery differences** (always use `-g1-toy`
for original Hasbro items):

- Jazz (Martini racing livery), Smokescreen (#38 racing), Mirage (Gitanes F1 livery),
  Wheeljack (Alitalia livery), Prowl (police markings), Hound (military markings),
  Tracks (flame decals), Red Alert (fire chief markings), Inferno (fire dept markings)
- Plus existing: Ratchet, Ironhide, Bluestreak, Megatron, Jetfire, Shockwave, Swoop,
  Astrotrain, Ultra Magnus, Galvatron (proportions/color divergence)

When adding new toy-deco third-party items, also check if the corresponding `-g1-toy`
appearance exists — if not, create it first.

### Multi-character products

The schema requires exactly one `character_slug` per item. For multi-character retail
products (cassette 2-packs, combiner giftsets):

- **Cassette 2-packs**: Use the first-listed character as `character_slug`. Note the
  second character in `metadata.notes`. Example: "Ravage & Rumble" → `character_slug: "ravage"`,
  notes: "2-pack with Rumble"
- **Combiner giftsets**: Use the combined form's `character_slug`. Example: Devastator
  giftset → `character_slug: "devastator"`
- **Slug for 2-packs**: `{code}-{char1}-and-{char2}` (e.g., `05731-ravage-and-rumble`)

### Official (first-party) Hasbro/Takara items

For vintage Hasbro G1 items (1984-1990):

- `is_third_party`: always `false`
- `size_class`: `null` (vintage G1 predated modern size classes)
- `manufacturer_slug`: `"hasbro"` for US-market items
- `toy_line_slug`: `"the-transformers-g1"`
- `metadata.sub_brand`: `"The Transformers"`
- Product codes: use Hasbro item numbers from TFArchive. When only assortment codes are
  available, use the assortment code and note it in metadata. When no code is documented,
  use `"UNKNOWN"` as product_code with `hasbro-{name}-g1` slug format and add
  `"UNCERTAIN: Hasbro product code not documented in TFArchive"` to notes.

### Bulk item generation with Python

For generating 50+ items, write a Python script instead of hand-crafting JSON. This is
faster and less error-prone:

```python
import json

data = json.load(open('items/{mfr}/{file}.json'))
apps = json.load(open('appearances/{file}.json'))
app_slugs = {a['slug'] for a in apps['data']}

def item(code, name, slug, char_slug, year, app_override=None, notes="", ...):
    """Generate a single item record."""
    app = app_override or find_best_appearance(char_slug)
    return { "product_code": code, "name": name, ... }

new_items = [
    item("05796", "Optimus Prime", "05796-optimus-prime", "optimus-prime", 1984, ...),
    # ... more items
]

# Verify FKs, merge, update metadata, write
data['items'].extend(new_items)
data['_metadata']['total_items'] = len(data['items'])
json.dump(data, open(..., 'w'), indent=2)
```

This approach:

1. Validates all FKs before writing (catches errors early)
2. Handles metadata count updates automatically
3. Inserts appearances at the right position (after cartoon counterpart)
4. Avoids JSON formatting errors from manual editing

### Valid metadata.status values

`released`, `pre-order`, `announced`, `unannounced`, `cancelled`, `in_development`

### 4d — Character appearances format

Target file: `api/db/seed/appearances/{source-slug}.json`

File naming convention — one file per media source grouping:

- G1 cartoon: `g1-cartoon.json` (all NA cartoon S1-S4 + Movie appearances)
- G1 comics: `g1-comics.json` (Marvel US/UK, IDW, etc.)
- Beast Era cartoon: `beast-era-cartoon.json`
- Other: `{continuity-slug}-{media-type}.json` (e.g., `animated-cartoon.json`)

Appearances within a file are ordered to match their character file's chronological order.

Each appearance record:

```json
{
  "slug": "optimus-prime-g1-cartoon",
  "name": "Optimus Prime (G1 Cartoon)",
  "character_slug": "optimus-prime",
  "description": "Classic red-and-blue cab-over truck design with distinctive faceplate",
  "source_media": "TV",
  "source_name": "The Transformers",
  "year_start": 1984,
  "year_end": 1987,
  "metadata": {}
}
```

File envelope:

```json
{
  "_metadata": {
    "table": "character_appearances",
    "description": "Character appearance seed data for {source description}",
    "generated": "{ISO timestamp}",
    "total": 0,
    "import_order": 5.5,
    "references": ["characters (via character_slug)"]
  },
  "data": []
}
```

Rules:

- `character_slug` MUST resolve to `existingCharacterSlugs`.
- `source_media` MUST be one of: `TV`, `Comic/Manga`, `Movie`, `OVA`, `Toy-only`, `Video Game`.
- Slug follows `{character-slug}-{source-descriptor}` convention (migration 013 comment).
- Do not create appearances for characters not yet in seed data.

### 4e — Reference data

When new factions, sub_groups, manufacturers, toy_lines, or continuity_families are needed:

1. Read the current reference file.
2. Append new entries to the `data` array.
3. Update `_metadata.total` to the new array length.
4. Write the merged file.

Generate reference data BEFORE generating characters or items that depend on it.

## Step 5 — Pre-Write Integrity Check

Before writing anything, verify:

1. **Slug uniqueness**: Every new slug is absent from the existing slug sets.
2. **FK resolution**: Every FK slug resolves against existing data or data being generated
   in the same batch.
3. **Combiner consistency** (if applicable):
   - Combined forms have `is_combined_form: true`
   - Each component's `combined_form_slug` matches the combined form
   - `component_slugs` on the form lists all components
4. **Metadata count**: `total_characters` / `total_items` / `total` equals actual array length.
5. **Uncertain data**: List every `UNCERTAIN:` note.

Report format:

```
Pre-write check:
- Slugs: N new, 0 collisions
- FKs: all resolved / UNRESOLVED: [list]
- Combiner consistency: OK / ISSUES: [list]
- Metadata count: verified
- Uncertain data points: N
```

If there are unresolved FKs or uncertain data, pause and ask the user to confirm.
For clean data (no issues), proceed without asking.

## Step 6 — Preview and Write

### 6a — Preview

Show a summary diff:

```
Files to write:
  CREATE  api/db/seed/characters/beast-wars.json  (47 characters)
  CREATE  api/db/seed/appearances/beast-wars-cartoon.json  (47 appearances)
  MODIFY  api/db/seed/reference/sub_groups.json  (+3 entries, total 55)

New entries preview (first 5):
  characters/beast-wars.json:
    + optimus-primal (Optimus Primal, Maximal, gorilla)
    + megatron-bw (Megatron, Predacon, T-rex)
    + cheetor (Cheetor, Maximal, cheetah)
    + rattrap (Rattrap, Maximal, rat)
    + dinobot (Dinobot, Predacon→Maximal, velociraptor)
    ... (+42 more)
```

Ask: **"Write these files? (yes/no)"**

Do NOT proceed without explicit user confirmation.

### 6b — Write

On confirmation:

1. **Reference files first** (if modified): read-merge-rewrite with updated `_metadata.total`.
2. **Character files**: for new files, write the full JSON. For existing files, read-merge-rewrite
   (append to `characters` array, update `_metadata.total_characters` and `_metadata.generated`).
3. **Appearance files**: write full JSON (typically new files).
4. **Item files**: for new files, create the manufacturer directory if needed. For existing
   files, read-merge-rewrite.

Use 2-space indentation throughout (matching existing files).

### 6c — Register new files in validation test

When a NEW character file is created (not a merge into existing), add its path to the
`CHARACTER_FILES` array in `api/src/db/seed-validation.test.ts`:

```bash
grep -n "CHARACTER_FILES\|ITEM_FILES" /Users/buta/Repos/track-em-toys/api/src/db/seed-validation.test.ts
```

Use the Edit tool to add the new filename to the appropriate array.

New appearance files are automatically discovered by the dynamic `readdirSync` loader
in the test file — no manual registration needed.

## Step 7 — Validate

After writing all files, run the seed validation tests:

```bash
cd /Users/buta/Repos/track-em-toys/api && npx vitest run src/db/seed-validation.test.ts 2>&1 | tail -50
```

**If validation passes:** Report "Validation passed" with test count and list of written files.

**If validation fails:**

1. Show the failing test names and error messages.
2. Diagnose which generated entries caused the failure.
3. Fix the entries in the file(s).
4. Re-run validation.
5. Repeat until all tests pass, or report a blocking issue requiring human resolution.

Do NOT consider the task complete until validation passes.

## Reference: Valid Values

### character_type (non-exhaustive — research the correct term for each character)

`Transformer`, `Human`, `Mini-Con`, `Predacon`, `Maximal`, `Vehicon`, `Spark`,
`Pretender`, `Headmaster`, `Targetmaster`, `Powermaster`, `Actionmaster`,
`Micromaster`, `Quintesson`, `Nebulan`, `Junkion`, `Lithone`, `Brainmaster`,
`Godmaster`, `Other`

### size_class (collector convention)

`Masterpiece`, `Voyager`, `Deluxe`, `Leader`, `Commander`, `Titan`,
`Legends`, `Scout`, `Basic`, `Ultra`, `Supreme`, `Core`

### Continuity family slug mapping (for common request terms)

| User says                               | continuity_family_slug    |
| --------------------------------------- | ------------------------- |
| G1, Generation 1, Season 1-4, The Movie | `g1`                      |
| Beast Wars, Beast Machines              | `beast-era`               |
| Armada, Energon, Cybertron              | `unicron-trilogy`         |
| Bay movies, live-action                 | `movieverse`              |
| Animated                                | `animated`                |
| Prime, War for Cybertron, Rescue Bots   | `aligned`                 |
| Cyberverse                              | `cyberverse`              |
| EarthSpark                              | `earthspark`              |
| Transformers One                        | `one`                     |
| RiD 2001, Car Robots                    | `robots-in-disguise-2001` |

### Slug disambiguation for cross-continuity characters

When a character name exists in multiple continuity families, append the continuity
abbreviation to the slug: `megatron-bw`, `optimus-prime-animated`, `starscream-armada`.

Always check `existingCharacterKeys` (name + franchise + continuity_family_slug) first —
if that triple is unique, the base slug may be fine. But the slug itself must still be
globally unique across ALL files.

## Notes

- For new characters/items: always research before generating. Never fabricate data you
  cannot source.
- For appearances of existing characters: derive descriptions from the character's seed
  data (alt_mode, faction, character_type) and well-known design features. Do not web-fetch
  per-character — it wastes time and TFWiki articles don't contain visual descriptions.
- **Source authority by data type**:
  - Character data (faction, alt mode, continuity, sub-groups): **tfwiki.net**
  - Hasbro product codes / item numbers: **TFArchive** (tfarchive.com)
  - Third-party item data: manufacturer pages, TFW2005, Seibertron
  - TFWiki does NOT have Hasbro stock numbers — only Takara catalog numbers
- **TFWiki URL caveats**: Only main character page URLs work (e.g., `Optimus_Prime_(G1)`).
  Subpage paths like `/cartoon`, `/toys`, `/Generation_1` return 404. Disambiguation
  suffixes: `(G1)`, `(BW)`, `(Armada)`, `(Animated)`, `(Prime)`.
- TFWiki articles are narrative-focused (plot summaries). They do NOT contain visual
  design descriptions — visual information is conveyed through images that WebFetch
  cannot process.
- For third-party items, tfwiki coverage is sparse — use manufacturer product pages,
  TFW2005 wiki, and Seibertron galleries as supplements.
- The seed validation test runs against ALL seed files simultaneously. Adding a character
  that references a sub_group_slug not in the reference file will fail the entire suite.
- Do NOT modify `api/src/db/seed-validation.test.ts` validation logic unless the user
  explicitly asks. The test is the contract; generated data must conform to it.
- Never fetch authenticated URLs, never include credentials in URLs, never store raw
  fetched HTML in seed files — extract only the structured data.
- **Hasbro G1 product code scheme**: 5-digit numbers in the 057xx range. Organized by
  sub-line category: 057xx cars, 058xx jets, 059xx minibots/cassettes, etc. Later years
  (1988-1990) introduced new ranges (055xx for Micromasters/Pretenders). The 1990 Action
  Masters reuse the 057xx range from 1984 — product codes are year-scoped, not globally unique.
- **Hasbro G1 size_class**: Always `null` for vintage items. The modern size class system
  (Deluxe, Voyager, Leader, etc.) did not exist in 1984-1990.
- **TFArchive year sections**: May not match actual retail availability. Product code
  assignment year can differ from when the toy shipped (e.g., Blaster cassettes coded in
  1985 but sold in 1986 with Season 3). Use the section year by default but correct obvious
  discrepancies (e.g., Ratbat is unambiguously 1986).
- **After adding items for a manufacturer**: Audit existing items from OTHER manufacturers
  (especially third-party "Toy Deco" variants) that reference the same characters. Their
  `character_appearance_slug` may need updating to match newly created toy appearances.
