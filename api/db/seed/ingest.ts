/**
 * Seed ingestion script — reads JSON seed files from api/db/seed/ and upserts
 * them into PostgreSQL, resolving slug-based FK references to UUIDs.
 *
 * Usage:
 *   npx tsx db/seed/ingest.ts           # upsert mode (default)
 *   npx tsx db/seed/ingest.ts --purge --confirm   # truncate + re-seed
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import pino from 'pino'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReferenceRecord {
  slug: string
  name: string
  [key: string]: unknown
}

interface SubGroupRecord extends ReferenceRecord {
  faction_slug: string | null
  franchise_slug: string
}

interface ToyLineRecord extends ReferenceRecord {
  manufacturer_slug: string
  franchise_slug: string
}

interface ManufacturerRecord extends ReferenceRecord {
  is_official_licensee: boolean
  country: string | null
  website_url: string | null
  aliases: string[]
  notes: string | null
}

interface FranchiseRecord extends ReferenceRecord {
  sort_order: number | null
  notes: string | null
}

interface ContinuityFamilyRecord extends ReferenceRecord {
  franchise_slug: string
  sort_order: number | null
  notes: string | null
}

interface FactionRecord extends ReferenceRecord {
  franchise_slug: string
  notes: string | null
}

interface CharacterRecord {
  name: string
  slug: string
  franchise_slug: string
  faction_slug: string | null
  character_type: string | null
  alt_mode: string | null
  is_combined_form: boolean
  continuity_family_slug: string
  sub_group_slugs: string[]
  notes: string | null
  series_year?: string | null
  year_released?: number | null
  [key: string]: unknown
}

interface AppearanceRecord {
  slug: string
  name: string
  character_slug: string
  description: string | null
  source_media: string | null
  source_name: string | null
  year_start: number | null
  year_end: number | null
  metadata: Record<string, unknown>
}

interface ItemRecord {
  name: string
  slug: string
  product_code: string | null
  character_slug: string
  character_appearance_slug: string | null
  manufacturer_slug: string
  toy_line_slug: string
  is_third_party: boolean
  year_released: number | null
  size_class: string | null
  metadata: Record<string, unknown>
}

interface ReferenceFile<T = ReferenceRecord> {
  _metadata: { total: number; [key: string]: unknown }
  data: T[]
}

interface CharacterFile {
  _metadata: { total_characters: number; [key: string]: unknown }
  characters: CharacterRecord[]
}

interface AppearanceFile {
  _metadata: { total: number; [key: string]: unknown }
  data: AppearanceRecord[]
}

interface ItemFile {
  _metadata: { total_items: number; [key: string]: unknown }
  items: ItemRecord[]
}

interface RelationshipEntity {
  slug: string
  role: string | null
}

interface RelationshipRecord {
  type: string
  subtype: string | null
  entity1: RelationshipEntity
  entity2: RelationshipEntity
  metadata: Record<string, unknown>
}

interface RelationshipFile {
  _metadata: { total: number; [key: string]: unknown }
  relationships: RelationshipRecord[]
}

interface ItemRelationshipRecord {
  type: string
  subtype: string | null
  item1_slug: string
  item1_role: string | null
  item2_slug: string
  item2_role: string | null
  metadata: Record<string, unknown>
}

interface ItemRelationshipFile {
  _metadata: { total: number; [key: string]: unknown }
  item_relationships: ItemRelationshipRecord[]
}

// ─── Setup ──────────────────────────────────────────────────────────────────

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SEED_DIR = process.env['SEED_DATA_PATH']
  ? path.resolve(process.env['SEED_DATA_PATH'])
  : path.join(SCRIPT_DIR, 'sample')

const dbUrl = process.env['DATABASE_URL']
if (!dbUrl) {
  log.fatal('DATABASE_URL environment variable is required')
  process.exit(1)
}

const ssl =
  process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'staging'
    ? { rejectUnauthorized: true }
    : undefined

const pool = new pg.Pool({ connectionString: dbUrl, max: 1, ssl })

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadJson<T>(filePath: string): T {
  // Files validated by seed-validation.test.ts before ingest runs
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`loadJson: expected object in ${filePath}`)
  }
  return raw as T
}

function discoverJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f))
}

function discoverJsonFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f))
}

function resolveSlug(
  map: Map<string, string>,
  slug: string,
  context: string,
): string {
  const id = map.get(slug)
  if (id === undefined) {
    throw new Error(`Unresolved slug "${slug}" in ${context}`)
  }
  return id
}

function resolveOptionalSlug(
  map: Map<string, string>,
  slug: string | null,
  context: string,
): string | null {
  if (slug == null) return null
  return resolveSlug(map, slug, context)
}

const SLUG_TABLES = new Set([
  'franchises', 'continuity_families', 'factions', 'sub_groups',
  'manufacturers', 'toy_lines', 'characters',
  'character_appearances',
])

async function buildSlugMap(
  client: pg.PoolClient,
  table: string,
): Promise<Map<string, string>> {
  if (!SLUG_TABLES.has(table)) {
    throw new Error(`buildSlugMap: unexpected table "${table}"`)
  }
  const { rows } = await client.query<{ slug: string; id: string }>(
    `SELECT slug, id FROM ${table}`,
  )
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.slug, row.id)
  }
  log.debug({ map: table, size: map.size }, 'slug map built')
  return map
}

// ─── Reference table upserts ────────────────────────────────────────────────

async function upsertFranchises(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<FranchiseRecord>>(
    path.join(SEED_DIR, 'reference/franchises.json'),
  )
  for (const r of file.data) {
    await client.query(
      `INSERT INTO franchises (slug, name, sort_order, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         sort_order = EXCLUDED.sort_order,
         notes = EXCLUDED.notes`,
      [r.slug, r.name, r.sort_order ?? null, r.notes ?? null],
    )
  }
  log.info({ table: 'franchises', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'franchises')
}

async function upsertContinuityFamilies(
  client: pg.PoolClient,
  franchiseMap: Map<string, string>,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<ContinuityFamilyRecord>>(
    path.join(SEED_DIR, 'reference/continuity_families.json'),
  )
  for (const r of file.data) {
    const franchiseId = resolveSlug(
      franchiseMap,
      r.franchise_slug,
      `continuity_families > "${r.slug}"`,
    )
    await client.query(
      `INSERT INTO continuity_families (slug, name, franchise_id, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name,
         franchise_id = EXCLUDED.franchise_id,
         sort_order = EXCLUDED.sort_order,
         notes = EXCLUDED.notes`,
      [r.slug, r.name, franchiseId, r.sort_order ?? null, r.notes ?? null],
    )
  }
  log.info({ table: 'continuity_families', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'continuity_families')
}

async function upsertFactions(
  client: pg.PoolClient,
  franchiseMap: Map<string, string>,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<FactionRecord>>(
    path.join(SEED_DIR, 'reference/factions.json'),
  )
  for (const r of file.data) {
    const franchiseId = resolveSlug(
      franchiseMap,
      r.franchise_slug,
      `factions > "${r.slug}"`,
    )
    await client.query(
      `INSERT INTO factions (name, slug, franchise_id, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name,
         franchise_id = EXCLUDED.franchise_id,
         notes = EXCLUDED.notes`,
      [r.name, r.slug, franchiseId, r.notes ?? null],
    )
  }
  log.info({ table: 'factions', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'factions')
}

async function upsertSubGroups(
  client: pg.PoolClient,
  factionMap: Map<string, string>,
  franchiseMap: Map<string, string>,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<SubGroupRecord>>(
    path.join(SEED_DIR, 'reference/sub_groups.json'),
  )
  for (const r of file.data) {
    const factionId = resolveOptionalSlug(
      factionMap,
      r.faction_slug,
      `sub_groups > "${r.slug}"`,
    )
    const franchiseId = resolveSlug(
      franchiseMap,
      r.franchise_slug,
      `sub_groups > "${r.slug}"`,
    )
    await client.query(
      `INSERT INTO sub_groups (name, slug, faction_id, franchise_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name,
         faction_id = EXCLUDED.faction_id,
         franchise_id = EXCLUDED.franchise_id,
         notes = EXCLUDED.notes`,
      [r.name, r.slug, factionId, franchiseId, r.notes ?? null],
    )
  }
  log.info({ table: 'sub_groups', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'sub_groups')
}

async function upsertManufacturers(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<ManufacturerRecord>>(
    path.join(SEED_DIR, 'reference/manufacturers.json'),
  )
  for (const r of file.data) {
    await client.query(
      `INSERT INTO manufacturers (name, slug, is_official_licensee, country, website_url, aliases, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         is_official_licensee = EXCLUDED.is_official_licensee,
         country = EXCLUDED.country,
         website_url = EXCLUDED.website_url,
         aliases = EXCLUDED.aliases,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [
        r.name,
        r.slug,
        r.is_official_licensee,
        r.country ?? null,
        r.website_url ?? null,
        r.aliases ?? [],
        r.notes ?? null,
      ],
    )
  }
  log.info({ table: 'manufacturers', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'manufacturers')
}

async function upsertToyLines(
  client: pg.PoolClient,
  manufacturerMap: Map<string, string>,
  franchiseMap: Map<string, string>,
): Promise<Map<string, string>> {
  const file = loadJson<ReferenceFile<ToyLineRecord>>(
    path.join(SEED_DIR, 'reference/toy_lines.json'),
  )
  for (const r of file.data) {
    const manufacturerId = resolveSlug(
      manufacturerMap,
      r.manufacturer_slug,
      `toy_lines > "${r.slug}"`,
    )
    const franchiseId = resolveSlug(
      franchiseMap,
      r.franchise_slug,
      `toy_lines > "${r.slug}"`,
    )
    await client.query(
      `INSERT INTO toy_lines (name, slug, franchise_id, manufacturer_id, scale, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name,
         franchise_id = EXCLUDED.franchise_id,
         manufacturer_id = EXCLUDED.manufacturer_id,
         scale = EXCLUDED.scale,
         description = EXCLUDED.description,
         updated_at = now()`,
      [
        r.name,
        r.slug,
        franchiseId,
        manufacturerId,
        r.scale ?? null,
        r.description ?? null,
      ],
    )
  }
  log.info({ table: 'toy_lines', count: file.data.length }, 'upserted')
  return buildSlugMap(client, 'toy_lines')
}

// ─── Character upserts ──────────────────────────────────────────────────────

function assembleCharacterMetadata(char: CharacterRecord): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  if (char.notes != null) metadata['notes'] = char.notes
  if (char.series_year != null) metadata['series_year'] = char.series_year
  if (char.year_released != null) metadata['year_released'] = char.year_released
  return metadata
}

async function upsertCharactersPass1(
  client: pg.PoolClient,
  allCharacters: CharacterRecord[],
  continuityFamilyMap: Map<string, string>,
  factionMap: Map<string, string>,
  franchiseMap: Map<string, string>,
): Promise<Map<string, string>> {
  for (const c of allCharacters) {
    const continuityFamilyId = resolveSlug(
      continuityFamilyMap,
      c.continuity_family_slug,
      `characters > "${c.slug}"`,
    )
    const factionId = resolveOptionalSlug(
      factionMap,
      c.faction_slug,
      `characters > "${c.slug}"`,
    )
    const franchiseId = resolveSlug(
      franchiseMap,
      c.franchise_slug,
      `characters > "${c.slug}"`,
    )
    const metadata = assembleCharacterMetadata(c)

    await client.query(
      `INSERT INTO characters
         (name, slug, franchise_id, faction_id, character_type, alt_mode,
          is_combined_form, continuity_family_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name,
         faction_id = EXCLUDED.faction_id,
         character_type = EXCLUDED.character_type,
         alt_mode = EXCLUDED.alt_mode,
         is_combined_form = EXCLUDED.is_combined_form,
         continuity_family_id = EXCLUDED.continuity_family_id,
         metadata = EXCLUDED.metadata,
         updated_at = now()`,
      [
        c.name,
        c.slug,
        franchiseId,
        factionId,
        c.character_type ?? null,
        c.alt_mode ?? null,
        c.is_combined_form,
        continuityFamilyId,
        JSON.stringify(metadata),
      ],
    )
  }
  log.info({ table: 'characters', count: allCharacters.length, pass: 1 }, 'upserted')
  return buildSlugMap(client, 'characters')
}

async function upsertCharacterSubGroups(
  client: pg.PoolClient,
  allCharacters: CharacterRecord[],
  characterMap: Map<string, string>,
  subGroupMap: Map<string, string>,
): Promise<number> {
  let count = 0
  for (const c of allCharacters) {
    const characterId = resolveSlug(
      characterMap,
      c.slug,
      `character_sub_groups > "${c.slug}"`,
    )

    // Always delete so removed sub_group_slugs are cleaned up in upsert mode
    await client.query(
      'DELETE FROM character_sub_groups WHERE character_id = $1',
      [characterId],
    )

    for (const sgSlug of c.sub_group_slugs) {
      const subGroupId = resolveSlug(
        subGroupMap,
        sgSlug,
        `character_sub_groups > "${c.slug}" > sub_group_slugs`,
      )
      await client.query(
        `INSERT INTO character_sub_groups (character_id, sub_group_id)
         VALUES ($1, $2)
         ON CONFLICT (character_id, sub_group_id) DO NOTHING`,
        [characterId, subGroupId],
      )
      count++
    }
  }
  log.info({ table: 'character_sub_groups', count }, 'upserted')
  return count
}

// ─── Character relationship upserts ─────────────────────────────────────────

async function upsertCharacterRelationships(
  client: pg.PoolClient,
  characterMap: Map<string, string>,
): Promise<number> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'relationships'))
  let totalCount = 0

  for (const filePath of files) {
    const file = loadJson<RelationshipFile>(filePath)
    for (const r of file.relationships) {
      const ctx = `relationships > "${r.type}" > "${r.entity1.slug}"-"${r.entity2.slug}"`
      const entity1Id = resolveSlug(characterMap, r.entity1.slug, ctx)
      const entity2Id = resolveSlug(characterMap, r.entity2.slug, ctx)

      await client.query(
        `INSERT INTO character_relationships
           (type, subtype, entity1_id, entity1_role, entity2_id, entity2_role, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (type, entity1_id, entity2_id) DO UPDATE SET
           subtype = EXCLUDED.subtype,
           entity1_role = EXCLUDED.entity1_role,
           entity2_role = EXCLUDED.entity2_role,
           metadata = EXCLUDED.metadata`,
        [
          r.type,
          r.subtype ?? null,
          entity1Id,
          r.entity1.role ?? null,
          entity2Id,
          r.entity2.role ?? null,
          JSON.stringify(r.metadata ?? {}),
        ],
      )
    }
    totalCount += file.relationships.length
  }

  log.info({ table: 'character_relationships', count: totalCount }, 'upserted')
  return totalCount
}

// ─── Appearance upserts ─────────────────────────────────────────────────────

async function upsertAppearances(
  client: pg.PoolClient,
  characterMap: Map<string, string>,
): Promise<Map<string, string>> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'appearances'))
  let totalCount = 0

  for (const filePath of files) {
    const file = loadJson<AppearanceFile>(filePath)
    for (const a of file.data) {
      const characterId = resolveSlug(
        characterMap,
        a.character_slug,
        `character_appearances > "${a.slug}"`,
      )
      await client.query(
        `INSERT INTO character_appearances
           (slug, name, character_id, description, source_media, source_name,
            year_start, year_end, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug, character_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           source_media = EXCLUDED.source_media,
           source_name = EXCLUDED.source_name,
           year_start = EXCLUDED.year_start,
           year_end = EXCLUDED.year_end,
           metadata = EXCLUDED.metadata,
           updated_at = now()`,
        [
          a.slug,
          a.name,
          characterId,
          a.description ?? null,
          a.source_media ?? null,
          a.source_name ?? null,
          a.year_start ?? null,
          a.year_end ?? null,
          JSON.stringify(a.metadata ?? {}),
        ],
      )
    }
    totalCount += file.data.length
  }

  log.info({ table: 'character_appearances', count: totalCount }, 'upserted')
  return buildSlugMap(client, 'character_appearances')
}

// ─── Item upserts ───────────────────────────────────────────────────────────

async function upsertItems(
  client: pg.PoolClient,
  manufacturerMap: Map<string, string>,
  toyLineMap: Map<string, string>,
): Promise<{ allItems: ItemRecord[]; itemMap: Map<string, string> }> {
  const files = discoverJsonFilesRecursive(path.join(SEED_DIR, 'items'))
  const allItems: ItemRecord[] = []
  const itemMap = new Map<string, string>()

  for (const filePath of files) {
    const file = loadJson<ItemFile>(filePath)
    if (!Array.isArray(file.items)) continue
    for (const item of file.items) {
      const ctx = `items > "${item.slug}"`
      const manufacturerId = resolveSlug(manufacturerMap, item.manufacturer_slug, ctx)
      const toyLineId = resolveSlug(toyLineMap, item.toy_line_slug, ctx)

      const result = await client.query<{ id: string; slug: string }>(
        `INSERT INTO items
           (name, slug, manufacturer_id, toy_line_id,
            size_class, year_released,
            product_code, is_third_party, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug, franchise_id) DO UPDATE SET
           name = EXCLUDED.name,
           manufacturer_id = EXCLUDED.manufacturer_id,
           toy_line_id = EXCLUDED.toy_line_id,
           size_class = EXCLUDED.size_class,
           year_released = EXCLUDED.year_released,
           product_code = EXCLUDED.product_code,
           is_third_party = EXCLUDED.is_third_party,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING id, slug`,
        [
          item.name,
          item.slug,
          manufacturerId,
          toyLineId,
          item.size_class ?? null,
          item.year_released ?? null,
          item.product_code ?? null,
          item.is_third_party,
          JSON.stringify(item.metadata),
        ],
      )

      const row = result.rows[0]!
      itemMap.set(row.slug, row.id)
      allItems.push(item)
    }
  }

  log.info({ table: 'items', count: allItems.length }, 'upserted')
  return { allItems, itemMap }
}

// ─── Item character depiction upserts ───────────────────────────────────────

async function upsertItemCharacterDepictions(
  client: pg.PoolClient,
  allItems: ItemRecord[],
  appearanceMap: Map<string, string>,
  itemMap: Map<string, string>,
): Promise<number> {
  let count = 0

  for (const item of allItems) {
    if (item.character_appearance_slug == null) continue

    const ctx = `item_character_depictions > "${item.slug}"`
    const itemId = resolveSlug(itemMap, item.slug, ctx)
    const appearanceId = resolveSlug(appearanceMap, item.character_appearance_slug, ctx)

    // Delete existing depictions so changed appearance slugs are cleaned up in upsert mode
    await client.query(
      'DELETE FROM item_character_depictions WHERE item_id = $1',
      [itemId],
    )

    await client.query(
      `INSERT INTO item_character_depictions
         (item_id, appearance_id, is_primary)
       VALUES ($1, $2, TRUE)`,
      [itemId, appearanceId],
    )
    count++
  }

  log.info({ table: 'item_character_depictions', count }, 'upserted')
  return count
}

// ─── Item relationship upserts ───────────────────────────────────────────

async function upsertItemRelationships(
  client: pg.PoolClient,
  itemMap: Map<string, string>,
): Promise<number> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'item_relationships'))
  let totalCount = 0

  for (const filePath of files) {
    const file = loadJson<ItemRelationshipFile>(filePath)
    for (const r of file.item_relationships) {
      const ctx = `item_relationships > "${r.type}" > "${r.item1_slug}"-"${r.item2_slug}"`
      const item1Id = resolveSlug(itemMap, r.item1_slug, ctx)
      const item2Id = resolveSlug(itemMap, r.item2_slug, ctx)

      await client.query(
        `INSERT INTO item_relationships
           (type, subtype, item1_id, item1_role, item2_id, item2_role, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (type, item1_id, item2_id) DO UPDATE SET
           subtype = EXCLUDED.subtype,
           item1_role = EXCLUDED.item1_role,
           item2_role = EXCLUDED.item2_role,
           metadata = EXCLUDED.metadata`,
        [
          r.type,
          r.subtype ?? null,
          item1Id,
          r.item1_role ?? null,
          item2Id,
          r.item2_role ?? null,
          JSON.stringify(r.metadata ?? {}),
        ],
      )
    }
    totalCount += file.item_relationships.length
  }

  log.info({ table: 'item_relationships', count: totalCount }, 'upserted')
  return totalCount
}

// ─── Purge ──────────────────────────────────────────────────────────────────

async function runPurge(client: pg.PoolClient): Promise<void> {
  log.warn({ mode: 'purge' }, 'truncating all catalog tables')
  await client.query(
    `TRUNCATE
       item_character_depictions,
       item_relationships,
       character_relationships,
       items,
       character_appearances,
       character_sub_groups,
       characters,
       toy_lines,
       manufacturers,
       sub_groups,
       factions,
       continuity_families,
       franchises
     CASCADE`,
  )
  log.info('catalog tables truncated')
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function runSeed(client: pg.PoolClient): Promise<void> {
  // -1: Franchises (must be first — all other reference tables depend on it)
  const franchiseMap = await upsertFranchises(client)

  // 0-4: Reference tables
  const continuityFamilyMap = await upsertContinuityFamilies(client, franchiseMap)
  const factionMap = await upsertFactions(client, franchiseMap)
  const subGroupMap = await upsertSubGroups(client, factionMap, franchiseMap)
  const manufacturerMap = await upsertManufacturers(client)
  const toyLineMap = await upsertToyLines(client, manufacturerMap, franchiseMap)

  // 5: Characters — load all files and insert
  const charFiles = discoverJsonFiles(path.join(SEED_DIR, 'characters'))
  const allCharacters: CharacterRecord[] = []
  for (const filePath of charFiles) {
    const file = loadJson<CharacterFile>(filePath)
    allCharacters.push(...file.characters)
  }
  log.info({ files: charFiles.length, characters: allCharacters.length }, 'loaded character files')

  const characterMap = await upsertCharactersPass1(
    client,
    allCharacters,
    continuityFamilyMap,
    factionMap,
    franchiseMap,
  )

  // 5b: Character sub-groups junction
  await upsertCharacterSubGroups(client, allCharacters, characterMap, subGroupMap)

  // 5.5: Character appearances
  const appearanceMap = await upsertAppearances(client, characterMap)

  // 5.7: Character relationships
  await upsertCharacterRelationships(client, characterMap)

  // 6: Items
  const { allItems, itemMap } = await upsertItems(client, manufacturerMap, toyLineMap)

  // 6b: Item character depictions (auto-generated from character_appearance_slug on items)
  await upsertItemCharacterDepictions(client, allItems, appearanceMap, itemMap)

  // 6c: Item relationships
  await upsertItemRelationships(client, itemMap)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isPurge = args.includes('--purge')
  const isConfirmed = args.includes('--confirm')

  if (isPurge && !isConfirmed) {
    log.fatal('--purge requires --confirm flag to execute. This will DELETE all catalog data.')
    process.exit(1)
  }

  log.info({ seedDir: SEED_DIR }, 'seed data source')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (isPurge) {
      await runPurge(client)
    }
    await runSeed(client)

    await client.query('COMMIT')
    log.info('seed complete')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // swallow rollback failure — original error is more useful
    }
    log.error({ err }, 'seed failed — rolled back')
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
