# Schema Evolution: Slug Keys & Enriched Characters

## What changed and why

### 1. Slug keys everywhere

Every shared catalog table now has a `slug TEXT NOT NULL UNIQUE` column — a URL-safe kebab-case identifier that serves as the **stable external key** for the entity. This is distinct from the `UUID` primary key, which remains the internal FK target. UUID PKs are used consistently across all tables (auth and catalog) to avoid mixed PK type systems.

**Why slugs?**

- **URL routing**: `/characters/optimus-prime` instead of `/characters/42`
- **API stability**: slugs survive database re-imports, migrations across environments, and bulk data loads where auto-increment IDs would differ
- **Human readability**: in JSON payloads, logs, and import files, `"character_slug": "optimus-prime"` is self-documenting
- **Cross-system joins**: when importing from JSON seed files (like the FansToys catalog), slugs let you reference characters by name-derived keys rather than fragile numeric IDs

**Slug convention:**

```
lowercase | hyphens-for-spaces | no-apostrophes | no-periods | no-special-chars
```

Examples:

- `optimus-prime`, `megatron`, `spike-witwicky`
- `dr-arkeville` (title included)
- `alpha-trion` (no special handling needed)
- `devastator` (combined forms get their own slug)
- `slag` not `slug-slug` (use the canonical name, not the renamed version)

**Tables with slugs:** `factions`, `sub_groups`, `characters`, `manufacturers`, `toy_lines`, `items`

---

### 2. New reference tables: `factions` and `sub_groups`

Instead of storing faction as a TEXT column or a CHECK constraint enum on `characters`, factions are normalized into their own table.

**`factions`** — Autobot, Decepticon, Quintesson, Human, Junkion, Nebulan, Lithone, Neutral, etc.

```
id | name         | slug         | franchise_id
1  | Autobot      | autobot      | → transformers
2  | Decepticon   | decepticon   | → transformers
3  | Human        | human        | → transformers
4  | Quintesson   | quintesson   | → transformers
5  | Junkion      | junkion      | → transformers
6  | Nebulan      | nebulan      | → transformers
7  | Lithone      | lithone      | → transformers
8  | Neutral      | neutral      | → transformers
9  | Cobra        | cobra        | → gi-joe
10 | G.I. Joe     | gi-joe       | → gi-joe
```

**Why normalize?** Adding a new faction (say, for a Japanese series expansion or a G.I. Joe rollout) is an INSERT, not a schema migration. The `franchise_id` FK on factions lets you scope faction dropdowns in the UI by franchise.

**`sub_groups`** — Dinobots, Constructicons, Aerialbots, Insecticons, Cassettes, Female Autobots, etc.

```
id | name           | slug            | faction_id
1  | Dinobots       | dinobots        | 1 (Autobot)
2  | Constructicons | constructicons  | 2 (Decepticon)
3  | Aerialbots     | aerialbots      | 1 (Autobot)
4  | Stunticons     | stunticons      | 2 (Decepticon)
5  | Insecticons    | insecticons     | 2 (Decepticon)
6  | Cassettes      | cassettes       | NULL (both factions have cassettes)
```

The optional `faction_id` FK lets you associate a sub-group with a faction when it's unambiguous (Dinobots → Autobot) but leave it NULL when the group spans factions (Cassettes exist on both sides, Headmasters exist on both sides).

**`sub_groups.name` uniqueness** is scoped to `(name, franchise_id)` rather than globally unique, allowing the same sub-group name in different franchises. The `slug` column remains globally unique for URL routing.

**Characters → sub_groups is many-to-many** via the `character_sub_groups` junction table (added in migration 012). A character can belong to multiple sub-groups (e.g., Apeface is both a Headmaster and a Horrorcon; the Coneheads are Seekers). The junction table uses `ON DELETE CASCADE` on both FKs — deleting a character or sub-group removes the associations.

---

### 3. Enriched `characters` table (migrations 011, 012, 013)

The characters table after all three catalog migrations:

```sql
characters (
    id, name, slug,
    franchise_id,           -- FK → franchises (RESTRICT) NOT NULL
    faction_id,             -- FK → factions (SET NULL)
    character_type,         -- 'Transformer', 'Human', 'Pretender', 'Godmaster', etc.
    alt_mode,               -- 'semi-truck', 'F-15 jet', etc.
    is_combined_form,       -- TRUE for Devastator, Superion, etc.
    combined_form_id,       -- self-FK: component → gestalt (SET NULL)
    combiner_role,          -- 'torso', 'right arm', 'upper body', 'weapon', etc.
    continuity_family_id,   -- FK → continuity_families (RESTRICT) NOT NULL
    metadata,               -- JSONB for japanese_name, first_appearance, aliases, notes
    created_at, updated_at
)
```

**Combiner modeling uses a self-referential FK.** Instead of a separate join table, each component character has a `combined_form_id` pointing to the gestalt character entry. This means:

- Devastator is a character entry with `is_combined_form = TRUE`
- Scrapper is a character entry with `combined_form_id → Devastator.id` and `combiner_role = 'right leg'`
- Query "all components of Devastator": `SELECT * FROM characters WHERE combined_form_id = <devastator_id>`
- Query "what does Scrapper combine into": `SELECT c.name FROM characters c WHERE c.id = scrapper.combined_form_id`

**Why `character_type` is TEXT, not an enum or FK?** The set of character types includes both species (`Transformer`, `Human`, `Nebulan`) and gimmick types (`Pretender`, `Godmaster`, `Brainmaster`, `Micromaster`). TEXT keeps the migration simple — new gimmick types from future series are just new values, not schema changes.

**`continuity_family_id` replaces the free-text `series` and `continuity` columns** (removed in migration 013). A continuity family is the identity boundary for a character — G1 Megatron and Beast Wars Megatron are different characters in different families, but G1 cartoon Megatron and G1 Marvel comic Megatron are the same character within the G1 family. The unique index is `(lower(name), franchise_id, continuity_family_id)`.

**Why a FK instead of free-text?** The original `continuity` column had a small fixed set of values (`G1 North America`, `G1 Japan`, `G1 Toy-only`). Normalizing into a reference table:

- Prevents typos and value drift across 400+ character records
- Provides a slug for URL routing (`/continuity-families/g1`)
- Supports `sort_order` for UI display ordering
- Enables adding new families (Beast Era, Animated, etc.) via INSERT, not migration

**Why `series` was removed:** The series level (e.g., `The Transformers Season 2`) was research organizational metadata, not a data modeling need. For a toy collection app, the app needs to know "this is the G1 version of Optimus Prime" — not which specific season they debuted in. Series-level detail is preserved as reference-only fields in the seed JSON files and can be tracked per-appearance in the `character_appearances` table.

### 3a. Continuity families

The `continuity_families` reference table follows the same pattern as `factions` — normalized reference data with slugs for stable external keys.

```sql
continuity_families (id, slug, name, franchise_id, sort_order, notes, created_at)
```

Current families (10): Generation 1, Beast Era, Robots in Disguise (2001), Unicron Trilogy, Live-Action Movies, Transformers Animated, Aligned/Prime, Cyberverse, EarthSpark, Transformers One.

**G1 is the mega-family:** It absorbs G2, Beast Wars sub-continuity threads that share characters, all comic publishers (Marvel US/UK, Dreamwave, IDW Phase 1 & 2, Skybound/Energon Universe), Binaltech, Classics, and the Japanese series (Headmasters, Masterforce, Victory, Zone). The sub-continuity level (G1 cartoon vs G1 Marvel comics) is handled by `character_appearances`, not by separate families.

**Beast Era is separate from G1** because Beast Wars reuses G1 character names for entirely different characters (Beast Wars Megatron is not G1 Megatron). The continuity family is the character identity boundary.

### 3b. Character appearances

The `character_appearances` table tracks how a character looks in a specific media source — the visual design layer between character identity and individual toy products.

```sql
character_appearances (
    id, slug, name,
    character_id,   -- FK → characters (CASCADE) NOT NULL
    description,    -- e.g., 'Blocky G1 cartoon design, flat red/blue colors'
    source_media,   -- TV, Comic, Movie, OVA, Toy-only, Video Game, Manga
    source_name,    -- e.g., 'The Transformers Season 1', 'IDW Phase 1'
    year_start, year_end,
    metadata,       -- JSONB for reference images, notes
    created_at, updated_at
)
```

**Three-layer model:**

1. **Character** (continuity family level) — "Optimus Prime (G1)" — the canonical identity
2. **Appearance** (media depiction) — "G1 cartoon Optimus Prime" vs "IDW Optimus Prime"
3. **Item** (specific toy product) — "MP-10 Optimus Prime" links to character + optionally to an appearance

Items link to appearances via the optional `character_appearance_id` FK (SET NULL). Items without an appearance link are "generic depiction of this character." This supports queries like "show me all toys depicting the G1 cartoon version of Optimus Prime."

### 3c. Size class on items

Migration 013 adds `size_class TEXT` (nullable) to the `items` table. Standard Transformers size classes include Core, Deluxe, Voyager, Leader, Commander, Titan, but third-party manufacturers use non-standard sizing. TEXT (not enum) avoids migration churn as size classes evolve.

**Why JSONB `metadata` instead of more columns?** Fields like `japanese_name`, `first_appearance`, `first_appearance_season`, and `aliases` are important for the character catalog but aren't needed for core collection queries (filtering, joining items to characters, combiner lookups). Putting them in JSONB keeps the table width manageable and makes it easy to add new display-only fields without migration.

---

### 4. Franchise normalization (migration 015)

The `franchise` column was originally a free TEXT field on 5 tables (characters, factions, sub_groups, continuity_families, toy_lines). Migration 015 normalizes it into a proper `franchises` reference table with UUID FK.

**`franchises`** — Transformers, G.I. Joe, Star Wars, Macross

```
id | slug          | name          | sort_order
1  | transformers  | Transformers  | 1
2  | gi-joe        | G.I. Joe      | 2
3  | star-wars     | Star Wars     | 3
4  | macross       | Macross       | 4
```

**Why normalize?**

- **Consistency enforcement**: FK prevents "Transformers" vs "transformers" vs "TF" — only valid franchise UUIDs allowed
- **Slug-based filtering**: API `?franchise=transformers` uses `fr.slug = $1` JOIN (consistent with all other slug filters)
- **Metadata support**: Display names, sort order, notes — franchise is a first-class entity
- **FK enforcement**: Typos in seed data fail at insert time, not silently
- **Discoverability**: `GET /catalog/franchises` queries the table directly instead of `SELECT DISTINCT`

**`franchise_id` is NOT NULL on all 5 tables.** Cross-franchise entities (Human, Neutral, Other factions) are assigned to Transformers. When these factions are needed for other franchises, they get duplicated per franchise with globally unique slugs (e.g., `human-gi-joe`).

**Index changes:**

- `idx_characters_name_franchise_cf`: `(lower(name), lower(franchise), continuity_family_id)` → `(lower(name), franchise_id, continuity_family_id)`
- `idx_sub_groups_name_franchise`: `(lower(name), COALESCE(franchise, ''))` → `(lower(name), franchise_id)` — simplified since franchise_id is NOT NULL

See `docs/decisions/ADR_Franchise_Normalization.md` for the full rationale and alternatives considered.

---

### 5. GDPR user deletion: tombstone pattern

User "deletion" uses a tombstone pattern rather than actually deleting the `users` row.

**Why tombstone instead of hard-delete + ON DELETE SET NULL?**

- **Auditability** — With SET NULL, all deleted users' contributions become indistinguishable (every `created_by` is NULL). With tombstoning, each item still points to a distinct (scrubbed) user ID. You can answer "were these items all from the same deleted user?" without retaining PII.
- **Zero cascading writes** — SET NULL requires PostgreSQL to UPDATE every referencing row across every table. Tombstoning only touches the `users` row itself.
- **FK integrity preserved** — No nullable FK gymnastics. `catalog_edits.editor_id NOT NULL` stays `NOT NULL` because the user row always exists.
- **JOINs stay simple** — INNER JOINs still work. No need for LEFT JOINs to handle nulled-out references.

**How it works:**

```sql
-- "Delete" a user: scrub PII, keep the row
UPDATE users SET
    email = 'deleted-' || id,   -- unique placeholder (satisfies UNIQUE index)
    display_name = NULL,
    avatar_url = NULL,
    email_verified = FALSE,
    deleted_at = now()
WHERE id = $1;

-- Hard-delete auth data (no tombstone needed)
DELETE FROM refresh_tokens WHERE user_id = $1;
DELETE FROM oauth_accounts WHERE user_id = $1;
```

**UI rule:** When `u.deleted_at IS NOT NULL`, display "Deleted user" — never the scrubbed fields.

**FK rule:** User FKs use the default ON DELETE behavior (RESTRICT/NO ACTION). The user row is never deleted, so no ON DELETE clause fires. NEVER add `ON DELETE CASCADE` or `ON DELETE SET NULL` on user FKs.

---

### 6. Slugs on `items` table

The items table now has a slug column for URL routing:

```
ft-03-quake-wave          (product_code + name)
mp-44-optimus-prime       (product_code + name)
rp-01-acoustic-wave       (product_code + name)
```

The item slug convention is `{product_code}-{name}` slugified. This ensures uniqueness even when multiple manufacturers produce figures with the same name.

---

### 7. Impact on existing FansToys JSON import

The relational JSON from the FansToys catalog maps cleanly to this new schema:

| JSON field                        | Target table.column                                           |
| --------------------------------- | ------------------------------------------------------------- |
| `character_name`                  | `characters.name` (lookup by slug)                            |
| `faction` (from character data)   | `characters.faction_id` → `factions.id`                       |
| `product_code`                    | `items.product_code`                                          |
| `name`                            | `items.name`                                                  |
| `manufacturer`                    | `items.manufacturer_id` → `manufacturers.id` (lookup by slug) |
| `sub_brand`                       | `items.toy_line_id` → `toy_lines.id` (lookup by slug)         |
| `variant_type`, `status`, `scale` | `items.metadata` JSONB                                        |

The import script should:

1. Seed `continuity_families`, `factions`, and `sub_groups` first
2. Seed `characters` with slugs and faction/sub_group/continuity_family FKs
3. Seed `manufacturers` and `toy_lines`
4. Seed `items` with FK lookups by slug (including optional `character_appearance_id`)

---

### 8. User roles

Migration 014b adds a `role` column to the `users` table:

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'curator', 'admin'));
CREATE INDEX idx_users_role ON users (role);
```

**Why a CHECK constraint instead of a separate `roles` table?** The role set is small and fixed (3 values). A normalized roles table adds JOIN complexity for a feature that doesn't need hierarchical permissions or dynamic role creation. If roles expand beyond 5-6 values, consider a separate table.

**Role is included in JWT claims.** This avoids a DB lookup on every request. When a role changes, the user's next token refresh picks up the new role.

**Why `TEXT` instead of an `ENUM`?** Consistent with the project convention — `character_type`, `combiner_role`, `edit_type`, `status` all use `TEXT + CHECK`. Adding a new role value is an `ALTER TABLE` in either case, but TEXT avoids PostgreSQL's enum type management quirks.

---

### 9. Two photo domains

The system has two distinct types of photos with different privacy models:

**Catalog photos** (`item_photos` table, migration 011):

- Centrally managed reference images (product shots, box art, alternate angles)
- Shared across all users — no RLS
- `uploaded_by` tracks who contributed the photo (attribution, not ownership)
- Feed ML training directly (app-managed content, not user PII)
- Upload requires `curator` role

**User collection photos** (future table, deferred to Phase 1.6):

- Private photos of a collector's own items (condition shots, shelf photos)
- RLS-protected via `user_id` + `(SELECT current_app_user_id())`
- Not used for ML training unless user explicitly opts in

**Why not add RLS to `item_photos`?** Catalog photos are shared reference data, like character entries or manufacturer records. Making them private would defeat their purpose — every user should see the same product shots. The `uploaded_by` column exists for attribution and GDPR deletion tracking (if a user deletes their account, their contributed catalog photos can be reassigned or removed), not for access control.

---

### 10. Migration numbers

Core catalog tables were created in migration `011_shared_catalog_tables.sql`. Schema enrichment (series, continuity, combiners, GDPR tombstone) happened in `012_enrich_characters_table.sql`. Continuity families, character appearances, and size class were added in `013_continuity_families_and_appearances.sql`.

All tables are in the `public` schema. The `update_updated_at()` trigger function from migration 001 is reused for `characters`, `items`, and `character_appearances`.
