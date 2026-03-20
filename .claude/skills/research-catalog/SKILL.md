---
name: research-catalog
description: "MANDATORY skill for adding, researching, or populating Transformers data in api/db/seed/. This skill contains the exact JSON schemas, slug rules, FK validation logic, and file naming conventions required by seed-validation.test.ts — without it, generated seed data WILL fail validation. You MUST use this skill whenever the user asks to: add characters (e.g. 'add Beast Wars characters', 'add Jetfire'), add items or product data (e.g. 'add FansToys items', 'research product codes', 'add 1987 Headmasters items'), add or update reference data (factions, sub-groups, manufacturers, toy lines, continuity families), generate character appearances, seed or populate any continuity (e.g. 'seed Animated', 'populate Unicron Trilogy'), or build out manufacturer catalogs (e.g. 'add X-Transbots', 'build out third party manufacturers'). Also trigger when the user mentions seed files, seed data, or references specific seed file paths like g1-characters.json or fanstoys.json. Do NOT attempt to generate seed JSON without this skill — the format is non-obvious and validation is strict."
---

# Research Catalog

Research Transformers data from authoritative sources and produce seed JSON files that pass
`api/src/db/seed-validation.test.ts` without modification.

This skill supports single-entity requests ("add Optimus Primal") through to large-scale
batch operations ("build out Beast Era, Unicron Trilogy, and all third-party manufacturers")
using tiered parallel orchestration.

## Quick Reference

- **Entity schemas & record formats**: read `references/entity-schemas.md`
- **Research sources & URL patterns**: read `references/research-sources.md`
- **Seed data root**: `api/db/seed/`
- **Validation test**: `api/src/db/seed-validation.test.ts`

---

## Step 1 — Classify the Request

Read the user's request and determine scope. A single request may span multiple categories
and multiple continuity families.

| Category | Trigger phrases | Target files |
| --- | --- | --- |
| **reference** | "add faction", "add sub-group", "add continuity", "add manufacturer", "add toy line" | `api/db/seed/reference/{table}.json` |
| **characters** | "add X characters", "add the Stunticons", "add Beast Wars cast" | `api/db/seed/characters/{continuity}.json` |
| **appearances** | "add appearances", "add character appearances" | `api/db/seed/appearances/{continuity}.json` |
| **items** | "add X-Transbots items", "add Hasbro Beast Wars", "add third-party items" | `api/db/seed/items/{mfr}/{file}.json` |

When the request includes characters, also generate appearances unless the user says otherwise.

**Scope assessment** — classify as:
- **Small** (1-5 entities): handle inline, no sub-agents needed
- **Medium** (6-30 entities): single continuity or manufacturer, use sub-agents for research
- **Large** (30+ entities or multi-continuity/multi-manufacturer): full tiered orchestration

If the category or scope is ambiguous, ask the user one clarifying question before proceeding.

---

## Step 2 — Load Existing Seed Data

Before any research, load current seed state for duplicate detection and FK validation.

### 2a — Always load ALL reference tables

Read these files using the Read tool:

- `api/db/seed/reference/franchises.json`
- `api/db/seed/reference/continuity_families.json`
- `api/db/seed/reference/factions.json`
- `api/db/seed/reference/sub_groups.json`
- `api/db/seed/reference/manufacturers.json`
- `api/db/seed/reference/toy_lines.json`

Build slug sets: `existingFactionSlugs`, `existingSubGroupSlugs`,
`existingContinuityFamilySlugs`, `existingManufacturerSlugs`, `existingToyLineSlugs`.

### 2b — Load character slugs

For large requests, use batch extraction for efficiency:

```bash
cd /Users/buta/Repos/track-em-toys/api/db/seed/characters && python3 -c "
import json, glob
slugs = set()
keys = set()
for f in sorted(glob.glob('*.json')):
    data = json.load(open(f))
    for c in data['characters']:
        slugs.add(c['slug'])
        keys.add(c['name'].lower() + '|||' + c.get('franchise_slug','') + '|||' + c.get('continuity_family_slug',''))
print(f'{len(slugs)} character slugs loaded')
for s in sorted(slugs): print(s)
" 2>&1 | head -5
```

For requests that need full character records (e.g., appearance generation), read the
character files directly.

### 2c — Load item and appearance slugs

```bash
cd /Users/buta/Repos/track-em-toys/api/db/seed && python3 -c "
import json, glob, os
for kind, pat in [('items', 'items/**/*.json'), ('appearances', 'appearances/*.json')]:
    slugs = set()
    for f in sorted(glob.glob(pat, recursive=True)):
        data = json.load(open(f))
        arr = data.get('items') or data.get('data') or []
        for r in arr: slugs.add(r['slug'])
    print(f'{len(slugs)} {kind} slugs loaded')
"
```

---

## Step 3 — Plan the Work

For **small** requests, skip to Step 5 (Research inline).

For **medium** and **large** requests, produce a work plan before spawning any sub-agents.

### 3a — Decompose into work units

Analyze the request and identify work units organized by tier:

```
Tier 0 — Reference data: new factions, sub-groups, continuity families needed
Tier 1 — Manufacturers & toy lines: new manufacturers, new toy lines per manufacturer
Tier 2 — Characters: one work unit per continuity family
Tier 3 — Appearances: one work unit per continuity family (depends on Tier 2 slugs)
Tier 4 — Items: one work unit per manufacturer × continuity family (depends on Tier 2+3)
```

### 3b — Estimate wave sizing

Cap concurrent sub-agents at **3-4 per wave** to avoid API and web-source throttling.

If a tier has more work units than the wave cap, split into sequential waves:
```
Tier 2 (8 character work units) → Wave A: 3 agents → Wave B: 3 agents → Wave C: 2 agents
```

### 3c — Present and confirm

Show the work plan to the user:

```
Work Plan:
  Tier 0 — Reference: +2 factions (maximal, predacon), +1 continuity (beast-era already exists)
  Tier 1 — Manufacturers: +1 (x-transbots), +2 toy lines
  Tier 2 — Characters: beast-era (est. ~50), animated (est. ~40)
  Tier 3 — Appearances: beast-era (est. ~50), animated (est. ~40)
  Tier 4 — Items: x-transbots/g1 (est. ~30), hasbro/beast-era (est. ~60)

  Wave sizing: 3 concurrent agents max
  Estimated total sub-agent spawns: 8
  Human checkpoints: plan confirmation (now), pre-write preview (end)

Proceed? (yes/no)
```

Wait for explicit user confirmation before spawning any agents.

---

## Step 4 — Tiered Parallel Execution

Execute the work plan tier by tier. Each tier completes before the next begins. Within
each tier, spawn work units in parallel up to the wave size limit.

### Tier execution protocol

For each tier:

1. **Spawn wave** — launch up to 3-4 sub-agents in parallel using the Agent tool
2. **Collect results** — each agent returns JSON arrays + uncertainty reports
3. **Update slug registry** — merge new slugs from this tier into the tracking sets
4. **Check for issues** — unresolved FKs, slug collisions, UNCERTAIN flags
5. **Proceed or pause** — if issues exist, report them before starting the next tier

### Sub-agent prompt template

Each sub-agent receives a self-contained prompt with everything it needs:

```
You are a seed data research agent for the Track'em Toys catalog.

TASK: {specific work unit description}
SCOPE: {what entities to research and generate}

SCHEMA: {paste the relevant record format from references/entity-schemas.md}

EXISTING SLUGS (do not duplicate): {relevant slug set for this entity type}

RESEARCH SOURCES (read references/research-sources.md for full details):
- Primary: {source for this entity type}
- Fallback chain: primary → alternate URL → web search → UNCERTAIN

RESILIENCE RULES:
- If WebFetch returns 429 (rate limited): try once more after a pause. If still blocked,
  switch to WebSearch for the same data.
- If WebFetch returns 404: try alternate URL patterns. If all fail, flag as UNCERTAIN.
- If data cannot be confirmed from any source: set to null, add UNCERTAIN note.
- ALWAYS return valid JSON with whatever data you gathered. Partial results with UNCERTAIN
  flags are better than no results.

OUTPUT FORMAT:
Return a JSON object with:
{
  "records": [ ...array of entity records matching the schema... ],
  "uncertain": [ ...list of UNCERTAIN flags with entity slug and reason... ],
  "unresolved_fks": [ ...list of FK slugs that could not be resolved... ],
  "sources": [ ...URLs consulted... ]
}
```

### Source-aware throttle management

Track web source health across waves within a tier:

- If Wave 1 agents report 429s from a specific source, adjust Wave 2:
  - Reduce wave size to 2 for that source
  - Switch remaining agents to WebSearch-first strategy
  - Add a brief pause between waves
- If a source is completely blocked, fall back to WebSearch-only for remaining work units

### Tier 0 — Reference data

Small, fast, no web research needed for most reference data. Generate inline (no sub-agents)
by appending to existing reference JSON files. Run this before any other tier since all
subsequent tiers depend on reference slugs resolving.

### Tier 1 — Manufacturers & toy lines

For new manufacturers: research the manufacturer's product catalog, numbering scheme, and
sub-brands. One sub-agent per manufacturer if multiple are needed.

### Tier 2 — Characters

One sub-agent per continuity family. Each agent:
- Fetches the TFWiki category page for that continuity (bulk fetch)
- Extracts character data: faction, alt mode, sub-groups, combiner info
- Generates character records matching the schema
- Returns the full JSON array

For very large continuity families (G1 has 440+ characters), split by era or faction:
- "G1 Season 1 Autobots", "G1 Season 1 Decepticons", "G1 Season 2 additions", etc.

### Tier 3 — Appearances

One sub-agent per continuity family. Each agent:
- Reads the character records from Tier 2 output (passed via prompt)
- Derives visual descriptions from alt_mode, faction, and design knowledge
- Does NOT web-fetch per character (wasteful — TFWiki has no visual descriptions)
- Generates appearance records

For bulk generation, the agent can use batch extraction from the character data:
```bash
cat characters/{file}.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data['characters']:
    print(f\"{c['slug']}|{c['name']}|{c['character_type']}|{c.get('alt_mode') or 'null'}|{c.get('faction_slug') or 'null'}|{c.get('is_combined_form', False)}\")
"
```

### Tier 4 — Items

One sub-agent per manufacturer × continuity family combination. Each agent:
- Researches items from the appropriate source (TFArchive for Hasbro, manufacturer pages for third-party)
- Resolves character_slug and character_appearance_slug against known slugs
- Generates item records
- For any item whose character doesn't exist in Tier 2 output or existing seed data,
  the agent MUST also generate the character record AND at least a `Toy-only` appearance

**Complete chain rule**: Every item needs character → appearance → item. The existing G1 data
has zero null `character_slug` values across 277 items — toy-only characters (no cartoon
appearance) still get a character record and a `source_media: "Toy-only"` appearance. Tier 4
agents must follow this pattern. If a character can't be researched, skip the item entirely
rather than generating it with a null `character_slug`.

### Progressive enrichment (for large requests)

Rather than trying to get everything perfect in one pass:

1. **First pass**: gather everything available from bulk sources (category pages, product lists)
2. **Gap analysis**: identify entities with UNCERTAIN or null fields
3. **Targeted follow-up**: spawn smaller agents to fill specific gaps via individual page fetches
4. **Merge**: combine first-pass and follow-up data

This minimizes total web fetches and makes the system resilient — if follow-up gets throttled,
you still have 80%+ of the data.

---

## Step 5 — Research (Small Requests)

For small requests (1-5 entities), research inline without sub-agents.

Read `references/research-sources.md` for source URLs, patterns, and caveats.

### Appearances for existing characters (no web research needed)

When generating appearances for characters already in seed data, the character records contain
everything needed. Use alt_mode, faction, character_type, and well-established design knowledge
to write visual descriptions. Do not web-fetch per character.

### New characters and items (web research required)

Follow the research source priority from `references/research-sources.md`:
1. TFWiki for character data
2. TFArchive for Hasbro product codes
3. Manufacturer pages for third-party items
4. Web search as fallback

---

## Step 6 — Pre-Write Integrity Check

After all research is complete (whether from sub-agents or inline), verify:

1. **Slug uniqueness**: every new slug absent from existing slug sets
2. **FK resolution**: every FK slug resolves to existing data or data in the same batch
3. **Combiner consistency** (if applicable):
   - Combined forms have `is_combined_form: true`
   - Each component's `combined_form_slug` matches the combined form
   - `component_slugs` on the form lists all components
4. **Metadata counts**: `total_characters` / `total_items` / `total` equals actual array length
5. **Uncertain data**: list every `UNCERTAIN:` note

Report format:

```
Pre-write check:
- Slugs: N new, 0 collisions
- FKs: all resolved / UNRESOLVED: [list]
- Combiner consistency: OK / ISSUES: [list]
- Metadata count: verified
- Uncertain data points: N
```

If unresolved FKs or uncertain data exist, pause and ask the user.
For clean data (no issues), proceed to preview.

---

## Step 7 — Preview and Write

### 7a — Preview

Show a summary:

```
Files to write:
  CREATE  api/db/seed/characters/beast-era-characters.json  (47 characters)
  CREATE  api/db/seed/appearances/beast-era-appearances.json  (47 appearances)
  MODIFY  api/db/seed/reference/sub_groups.json  (+3 entries, total 55)

New entries preview (first 5):
  characters/beast-era-characters.json:
    + optimus-primal (Optimus Primal, Maximal, gorilla)
    + megatron-bw (Megatron, Predacon, T-rex)
    + cheetor (Cheetor, Maximal, cheetah)
    + rattrap (Rattrap, Maximal, rat)
    + dinobot (Dinobot, Predacon→Maximal, velociraptor)
    ... (+42 more)
```

Ask: **"Write these files? (yes/no)"**

Do NOT proceed without explicit user confirmation.

### 7b — Write

On confirmation, write in dependency order:

1. **Reference files** (if modified): read-merge-rewrite with updated `_metadata.total`
2. **Character files**: new files → full JSON. Existing → read-merge-rewrite, append to
   `characters` array, update `_metadata.total_characters`
3. **Appearance files**: typically new files, write full JSON
4. **Item files**: create manufacturer directory if needed. New → full JSON. Existing →
   read-merge-rewrite

Use 2-space indentation throughout (matching existing files).

### 7c — Register new files in validation test

When a NEW character or item file is created, add its path to the appropriate array in
`api/src/db/seed-validation.test.ts`:

```bash
grep -n "CHARACTER_FILES\|ITEM_FILES" api/src/db/seed-validation.test.ts
```

Use the Edit tool to add the new filename. Appearance files are auto-discovered and need
no registration.

### Bulk generation with Python

For generating 50+ items, write a Python script instead of hand-crafting JSON. This is faster
and less error-prone. The script should:

1. Load existing seed data for FK validation
2. Generate records from a structured data table
3. Verify all FKs before writing
4. Handle metadata count updates automatically
5. Write formatted JSON with 2-space indentation

---

## Step 8 — Validate

Run seed validation:

```bash
cd /Users/buta/Repos/track-em-toys/api && npx vitest run src/db/seed-validation.test.ts 2>&1 | tail -50
```

**If validation passes:** report success with test count and list of written files.

**If validation fails:**

1. Show failing test names and errors
2. Diagnose which entries caused the failure
3. Fix the entries
4. Re-run validation
5. Repeat until all tests pass, or report a blocking issue

Do NOT consider the task complete until validation passes.

### Post-write audit for items

After adding items for a manufacturer, audit existing items from OTHER manufacturers
(especially third-party "Toy Deco" variants) that reference the same characters. Their
`character_appearance_slug` may need updating to match newly created appearances.

---

## Notes

- Read `references/entity-schemas.md` for complete record formats and valid enum values
- Read `references/research-sources.md` for web research patterns and source authority
- The seed validation test runs against ALL seed files simultaneously — adding an entity
  that references a slug not in seed data will fail the entire suite
- Do NOT modify `api/src/db/seed-validation.test.ts` validation logic unless the user asks
- Characters within a file are ordered by narrative chronology, not alphabetically
- For combiners: combined form and all components go in the SAME character file
