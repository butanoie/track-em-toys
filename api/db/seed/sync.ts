/**
 * Bidirectional seed data sync — compares seed JSON timestamps against DB
 * updated_at to determine sync direction per record.
 *
 * Usage:
 *   npx tsx db/seed/sync.ts --push        # seed → DB (timestamp-checked)
 *   npx tsx db/seed/sync.ts --pull        # DB → seed (timestamp-checked)
 *   npx tsx db/seed/sync.ts --push --pull # bidirectional
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import pino from 'pino'

import type {
  AppearanceFile,
  AppearanceRecord,
  CharacterFile,
  CharacterRecord,
  ContinuityFamilyRecord,
  FactionRecord,
  FranchiseRecord,
  ItemFile,
  ItemRecord,
  ItemRelationshipFile,
  ItemRelationshipRecord,
  ManufacturerRecord,
  ReferenceFile,
  RelationshipFile,
  RelationshipRecord,
  SubGroupRecord,
  TimestampStamp,
  ToyLineRecord,
} from './seed-types.js'

import {
  assembleCharacterMetadata,
  buildReverseSlugMap,
  buildSlugMap,
  dbIsNewer,
  disassembleCharacterMetadata,
  discoverJsonFiles,
  discoverJsonFilesRecursive,
  loadJson,
  resolveOptionalSlug,
  resolveSlug,
  resolveSeedDir,
  saveJson,
  seedIsNewer,
} from './seed-io.js'

// ─── Setup ──────────────────────────────────────────────────────────────────

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

const SEED_DIR = resolveSeedDir()

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

// ─── Push helpers ───────────────────────────────────────────────────────────

/** Check DB updated_at for a record identified by slug (globally unique tables). */
async function getDbUpdatedAt(
  client: pg.PoolClient,
  table: string,
  slug: string,
): Promise<Date | null> {
  const { rows } = await client.query<{ updated_at: Date }>(
    `SELECT updated_at FROM ${pg.escapeIdentifier(table)} WHERE slug = $1`,
    [slug],
  )
  return rows[0]?.updated_at ?? null
}

/** Check DB updated_at for a franchise-scoped record. */
async function getDbUpdatedAtScoped(
  client: pg.PoolClient,
  table: string,
  slug: string,
  franchiseSlug: string,
): Promise<Date | null> {
  const { rows } = await client.query<{ updated_at: Date }>(
    `SELECT t.updated_at FROM ${pg.escapeIdentifier(table)} t
     JOIN franchises fr ON fr.id = t.franchise_id
     WHERE t.slug = $1 AND fr.slug = $2`,
    [slug, franchiseSlug],
  )
  return rows[0]?.updated_at ?? null
}

// ─── Push: Reference tables ─────────────────────────────────────────────────

async function pushFranchises(
  client: pg.PoolClient,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/franchises.json')
  const file = loadJson<ReferenceFile<FranchiseRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAt(client, 'franchises', r.slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO franchises (slug, name, sort_order, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         sort_order = EXCLUDED.sort_order,
         notes = EXCLUDED.notes
       RETURNING updated_at`,
      [r.slug, r.name, r.sort_order ?? null, r.notes ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'franchises', pushed, skipped }, 'push')
  return buildSlugMap(client, 'franchises')
}

async function pushContinuityFamilies(
  client: pg.PoolClient,
  franchiseMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/continuity_families.json')
  const file = loadJson<ReferenceFile<ContinuityFamilyRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAtScoped(client, 'continuity_families', r.slug, r.franchise_slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const franchiseId = resolveSlug(franchiseMap, r.franchise_slug, `continuity_families > "${r.slug}"`)
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO continuity_families (slug, name, franchise_id, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name, franchise_id = EXCLUDED.franchise_id,
         sort_order = EXCLUDED.sort_order, notes = EXCLUDED.notes
       RETURNING updated_at`,
      [r.slug, r.name, franchiseId, r.sort_order ?? null, r.notes ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'continuity_families', pushed, skipped }, 'push')
  return buildSlugMap(client, 'continuity_families')
}

async function pushFactions(
  client: pg.PoolClient,
  franchiseMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/factions.json')
  const file = loadJson<ReferenceFile<FactionRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAtScoped(client, 'factions', r.slug, r.franchise_slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const franchiseId = resolveSlug(franchiseMap, r.franchise_slug, `factions > "${r.slug}"`)
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO factions (name, slug, franchise_id, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name, franchise_id = EXCLUDED.franchise_id, notes = EXCLUDED.notes
       RETURNING updated_at`,
      [r.name, r.slug, franchiseId, r.notes ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'factions', pushed, skipped }, 'push')
  return buildSlugMap(client, 'factions')
}

async function pushSubGroups(
  client: pg.PoolClient,
  factionMap: Map<string, string>,
  franchiseMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/sub_groups.json')
  const file = loadJson<ReferenceFile<SubGroupRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAtScoped(client, 'sub_groups', r.slug, r.franchise_slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const factionId = resolveOptionalSlug(factionMap, r.faction_slug, `sub_groups > "${r.slug}"`)
    const franchiseId = resolveSlug(franchiseMap, r.franchise_slug, `sub_groups > "${r.slug}"`)
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO sub_groups (name, slug, faction_id, franchise_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name, faction_id = EXCLUDED.faction_id,
         franchise_id = EXCLUDED.franchise_id, notes = EXCLUDED.notes
       RETURNING updated_at`,
      [r.name, r.slug, factionId, franchiseId, r.notes ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'sub_groups', pushed, skipped }, 'push')
  return buildSlugMap(client, 'sub_groups')
}

async function pushManufacturers(
  client: pg.PoolClient,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/manufacturers.json')
  const file = loadJson<ReferenceFile<ManufacturerRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAt(client, 'manufacturers', r.slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO manufacturers (name, slug, is_official_licensee, country, website_url, aliases, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, is_official_licensee = EXCLUDED.is_official_licensee,
         country = EXCLUDED.country, website_url = EXCLUDED.website_url,
         aliases = EXCLUDED.aliases, notes = EXCLUDED.notes, updated_at = now()
       RETURNING updated_at`,
      [r.name, r.slug, r.is_official_licensee, r.country ?? null,
       r.website_url ?? null, r.aliases ?? [], r.notes ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'manufacturers', pushed, skipped }, 'push')
  return buildSlugMap(client, 'manufacturers')
}

async function pushToyLines(
  client: pg.PoolClient,
  manufacturerMap: Map<string, string>,
  franchiseMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const filePath = path.join(SEED_DIR, 'reference/toy_lines.json')
  const file = loadJson<ReferenceFile<ToyLineRecord>>(filePath)
  let pushed = 0, skipped = 0

  for (const r of file.data) {
    const dbTime = await getDbUpdatedAtScoped(client, 'toy_lines', r.slug, r.franchise_slug)
    if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
      skipped++
      continue
    }
    const manufacturerId = resolveSlug(manufacturerMap, r.manufacturer_slug, `toy_lines > "${r.slug}"`)
    const franchiseId = resolveSlug(franchiseMap, r.franchise_slug, `toy_lines > "${r.slug}"`)
    const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
      `INSERT INTO toy_lines (name, slug, franchise_id, manufacturer_id, scale, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug, franchise_id) DO UPDATE SET
         name = EXCLUDED.name, franchise_id = EXCLUDED.franchise_id,
         manufacturer_id = EXCLUDED.manufacturer_id, scale = EXCLUDED.scale,
         description = EXCLUDED.description, updated_at = now()
       RETURNING updated_at`,
      [r.name, r.slug, franchiseId, manufacturerId, r.scale ?? null, r.description ?? null],
    )
    stamps.push({ filePath, slug: r.slug, timestamp: upserted!.updated_at.toISOString() })
    pushed++
  }
  log.info({ table: 'toy_lines', pushed, skipped }, 'push')
  return buildSlugMap(client, 'toy_lines')
}

// ─── Push: Entity tables ────────────────────────────────────────────────────

async function pushCharacters(
  client: pg.PoolClient,
  continuityFamilyMap: Map<string, string>,
  factionMap: Map<string, string>,
  franchiseMap: Map<string, string>,
  subGroupMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const charFiles = discoverJsonFiles(path.join(SEED_DIR, 'characters'))
  let pushed = 0, skipped = 0

  for (const filePath of charFiles) {
    const file = loadJson<CharacterFile>(filePath)
    for (const c of file.characters) {
      const dbTime = await getDbUpdatedAtScoped(client, 'characters', c.slug, c.franchise_slug)
      if (dbTime !== null && !seedIsNewer(c.last_modified, dbTime)) {
        skipped++
        continue
      }
      const continuityFamilyId = resolveSlug(continuityFamilyMap, c.continuity_family_slug, `characters > "${c.slug}"`)
      const factionId = resolveOptionalSlug(factionMap, c.faction_slug, `characters > "${c.slug}"`)
      const franchiseId = resolveSlug(franchiseMap, c.franchise_slug, `characters > "${c.slug}"`)
      const metadata = assembleCharacterMetadata(c)

      const result = await client.query<{ id: string; updated_at: Date }>(
        `INSERT INTO characters
           (name, slug, franchise_id, faction_id, character_type, alt_mode,
            is_combined_form, continuity_family_id, search_aliases, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug, franchise_id) DO UPDATE SET
           name = EXCLUDED.name, faction_id = EXCLUDED.faction_id,
           character_type = EXCLUDED.character_type, alt_mode = EXCLUDED.alt_mode,
           is_combined_form = EXCLUDED.is_combined_form,
           continuity_family_id = EXCLUDED.continuity_family_id,
           search_aliases = EXCLUDED.search_aliases,
           metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING id, updated_at`,
        [c.name, c.slug, franchiseId, factionId, c.character_type ?? null,
         c.alt_mode ?? null, c.is_combined_form, continuityFamilyId,
         c.search_aliases ?? null, JSON.stringify(metadata)],
      )
      const characterId = result.rows[0]!.id
      const dbUpdatedAt = result.rows[0]!.updated_at

      // Rebuild sub-groups for this character
      await client.query('DELETE FROM character_sub_groups WHERE character_id = $1', [characterId])
      for (const sgSlug of c.sub_group_slugs) {
        const subGroupId = resolveSlug(subGroupMap, sgSlug, `character_sub_groups > "${c.slug}" > sub_group_slugs`)
        await client.query(
          `INSERT INTO character_sub_groups (character_id, sub_group_id) VALUES ($1, $2)
           ON CONFLICT (character_id, sub_group_id) DO NOTHING`,
          [characterId, subGroupId],
        )
      }

      stamps.push({ filePath, slug: c.slug, timestamp: dbUpdatedAt.toISOString() })
      pushed++
    }
  }
  log.info({ table: 'characters', pushed, skipped }, 'push')
  return buildSlugMap(client, 'characters')
}

async function pushAppearances(
  client: pg.PoolClient,
  characterMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'appearances'))
  let pushed = 0, skipped = 0

  for (const filePath of files) {
    const file = loadJson<AppearanceFile>(filePath)
    for (const a of file.data) {
      // Appearances are scoped by (slug, character_id) — look up via character
      const characterId = resolveSlug(characterMap, a.character_slug, `appearances > "${a.slug}"`)
      const { rows } = await client.query<{ updated_at: Date }>(
        `SELECT updated_at FROM character_appearances WHERE slug = $1 AND character_id = $2`,
        [a.slug, characterId],
      )
      const dbTime = rows[0]?.updated_at ?? null
      if (dbTime !== null && !seedIsNewer(a.last_modified, dbTime)) {
        skipped++
        continue
      }
      const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
        `INSERT INTO character_appearances
           (slug, name, character_id, description, source_media, source_name,
            year_start, year_end, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug, character_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           source_media = EXCLUDED.source_media, source_name = EXCLUDED.source_name,
           year_start = EXCLUDED.year_start, year_end = EXCLUDED.year_end,
           metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING updated_at`,
        [a.slug, a.name, characterId, a.description ?? null,
         a.source_media ?? null, a.source_name ?? null,
         a.year_start ?? null, a.year_end ?? null, JSON.stringify(a.metadata ?? {})],
      )
      stamps.push({ filePath, slug: a.slug, timestamp: upserted!.updated_at.toISOString() })
      pushed++
    }
  }
  log.info({ table: 'character_appearances', pushed, skipped }, 'push')
  return buildSlugMap(client, 'character_appearances')
}

async function pushItems(
  client: pg.PoolClient,
  manufacturerMap: Map<string, string>,
  toyLineMap: Map<string, string>,
  appearanceMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<Map<string, string>> {
  const files = discoverJsonFilesRecursive(path.join(SEED_DIR, 'items'))
  const itemMap = new Map<string, string>()
  let pushed = 0, skipped = 0

  for (const filePath of files) {
    const file = loadJson<ItemFile>(filePath)
    if (!Array.isArray(file.items)) continue
    for (const item of file.items) {
      // Items are franchise-scoped, but franchise_id is derived from toy_line.
      // Use a direct slug lookup since slugs are de facto unique.
      const dbTime = await getDbUpdatedAt(client, 'items', item.slug)
      if (dbTime !== null && !seedIsNewer(item.last_modified, dbTime)) {
        // Still need the item ID for the map
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM items WHERE slug = $1`, [item.slug],
        )
        if (rows[0]) itemMap.set(item.slug, rows[0].id)
        skipped++
        continue
      }

      const ctx = `items > "${item.slug}"`
      const manufacturerId = resolveSlug(manufacturerMap, item.manufacturer_slug, ctx)
      const toyLineId = resolveSlug(toyLineMap, item.toy_line_slug, ctx)

      const result = await client.query<{ id: string; slug: string; updated_at: Date }>(
        `INSERT INTO items
           (name, slug, manufacturer_id, toy_line_id, size_class, year_released,
            product_code, is_third_party, search_aliases, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slug, franchise_id) DO UPDATE SET
           name = EXCLUDED.name, manufacturer_id = EXCLUDED.manufacturer_id,
           toy_line_id = EXCLUDED.toy_line_id, size_class = EXCLUDED.size_class,
           year_released = EXCLUDED.year_released, product_code = EXCLUDED.product_code,
           is_third_party = EXCLUDED.is_third_party, search_aliases = EXCLUDED.search_aliases,
           metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING id, slug, updated_at`,
        [item.name, item.slug, manufacturerId, toyLineId,
         item.size_class ?? null, item.year_released ?? null,
         item.product_code ?? null, item.is_third_party,
         item.search_aliases ?? null, JSON.stringify(item.metadata)],
      )
      const row = result.rows[0]!
      itemMap.set(row.slug, row.id)

      // Rebuild item_character_depictions
      if (item.character_appearance_slug != null) {
        const appearanceId = resolveSlug(appearanceMap, item.character_appearance_slug, `item_character_depictions > "${item.slug}"`)
        await client.query('DELETE FROM item_character_depictions WHERE item_id = $1', [row.id])
        await client.query(
          `INSERT INTO item_character_depictions (item_id, appearance_id, is_primary) VALUES ($1, $2, TRUE)`,
          [row.id, appearanceId],
        )
      }

      stamps.push({ filePath, slug: item.slug, timestamp: row.updated_at.toISOString() })
      pushed++
    }
  }
  log.info({ table: 'items', pushed, skipped }, 'push')
  return itemMap
}

// ─── Push: Relationship tables ──────────────────────────────────────────────

async function pushCharacterRelationships(
  client: pg.PoolClient,
  characterMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<void> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'relationships'))
  let pushed = 0, skipped = 0

  for (const filePath of files) {
    const file = loadJson<RelationshipFile>(filePath)
    for (const r of file.relationships) {
      const ctx = `relationships > "${r.type}" > "${r.entity1.slug}"-"${r.entity2.slug}"`
      const entity1Id = resolveSlug(characterMap, r.entity1.slug, ctx)
      const entity2Id = resolveSlug(characterMap, r.entity2.slug, ctx)

      const { rows } = await client.query<{ updated_at: Date }>(
        `SELECT updated_at FROM character_relationships
         WHERE type = $1 AND entity1_id = $2 AND entity2_id = $3`,
        [r.type, entity1Id, entity2Id],
      )
      const dbTime = rows[0]?.updated_at ?? null
      if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
        skipped++
        continue
      }

      const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
        `INSERT INTO character_relationships
           (type, subtype, entity1_id, entity1_role, entity2_id, entity2_role, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (type, entity1_id, entity2_id) DO UPDATE SET
           subtype = EXCLUDED.subtype, entity1_role = EXCLUDED.entity1_role,
           entity2_role = EXCLUDED.entity2_role, metadata = EXCLUDED.metadata
         RETURNING updated_at`,
        [r.type, r.subtype ?? null, entity1Id, r.entity1.role ?? null,
         entity2Id, r.entity2.role ?? null, JSON.stringify(r.metadata ?? {})],
      )
      stamps.push({ filePath, slug: `${r.type}:${r.entity1.slug}:${r.entity2.slug}`, timestamp: upserted!.updated_at.toISOString() })
      pushed++
    }
  }
  log.info({ table: 'character_relationships', pushed, skipped }, 'push')
}

async function pushItemRelationships(
  client: pg.PoolClient,
  itemMap: Map<string, string>,
  stamps: TimestampStamp[],
): Promise<void> {
  const files = discoverJsonFiles(path.join(SEED_DIR, 'item_relationships'))
  let pushed = 0, skipped = 0

  for (const filePath of files) {
    const file = loadJson<ItemRelationshipFile>(filePath)
    for (const r of file.item_relationships) {
      const ctx = `item_relationships > "${r.type}" > "${r.item1_slug}"-"${r.item2_slug}"`
      const item1Id = resolveSlug(itemMap, r.item1_slug, ctx)
      const item2Id = resolveSlug(itemMap, r.item2_slug, ctx)

      const { rows } = await client.query<{ updated_at: Date }>(
        `SELECT updated_at FROM item_relationships
         WHERE type = $1 AND item1_id = $2 AND item2_id = $3`,
        [r.type, item1Id, item2Id],
      )
      const dbTime = rows[0]?.updated_at ?? null
      if (dbTime !== null && !seedIsNewer(r.last_modified, dbTime)) {
        skipped++
        continue
      }

      const { rows: [upserted] } = await client.query<{ updated_at: Date }>(
        `INSERT INTO item_relationships
           (type, subtype, item1_id, item1_role, item2_id, item2_role, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (type, item1_id, item2_id) DO UPDATE SET
           subtype = EXCLUDED.subtype, item1_role = EXCLUDED.item1_role,
           item2_role = EXCLUDED.item2_role, metadata = EXCLUDED.metadata
         RETURNING updated_at`,
        [r.type, r.subtype ?? null, item1Id, r.item1_role ?? null,
         item2Id, r.item2_role ?? null, JSON.stringify(r.metadata ?? {})],
      )
      stamps.push({ filePath, slug: `${r.type}:${r.item1_slug}:${r.item2_slug}`, timestamp: upserted!.updated_at.toISOString() })
      pushed++
    }
  }
  log.info({ table: 'item_relationships', pushed, skipped }, 'push')
}

// ─── Push orchestration ─────────────────────────────────────────────────────

async function runPush(client: pg.PoolClient): Promise<TimestampStamp[]> {
  const stamps: TimestampStamp[] = []

  const franchiseMap = await pushFranchises(client, stamps)
  const continuityFamilyMap = await pushContinuityFamilies(client, franchiseMap, stamps)
  const factionMap = await pushFactions(client, franchiseMap, stamps)
  const subGroupMap = await pushSubGroups(client, factionMap, franchiseMap, stamps)
  const manufacturerMap = await pushManufacturers(client, stamps)
  const toyLineMap = await pushToyLines(client, manufacturerMap, franchiseMap, stamps)

  const characterMap = await pushCharacters(
    client, continuityFamilyMap, factionMap, franchiseMap, subGroupMap, stamps,
  )
  const appearanceMap = await pushAppearances(client, characterMap, stamps)
  await pushCharacterRelationships(client, characterMap, stamps)

  const itemMap = await pushItems(client, manufacturerMap, toyLineMap, appearanceMap, stamps)
  await pushItemRelationships(client, itemMap, stamps)

  return stamps
}

/** Apply buffered last_modified stamps to seed files after DB COMMIT. */
function applyStamps(stamps: TimestampStamp[]): void {
  const byFile = new Map<string, Map<string, string>>()
  for (const s of stamps) {
    let slugMap = byFile.get(s.filePath)
    if (!slugMap) {
      slugMap = new Map<string, string>()
      byFile.set(s.filePath, slugMap)
    }
    slugMap.set(s.slug, s.timestamp)
  }

  for (const [filePath, slugMap] of byFile) {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (raw === null || typeof raw !== 'object') continue
    const file = raw as Record<string, unknown>

    // Determine which array key holds the records
    const records = findRecordArray(file)
    if (!records) continue

    for (const record of records) {
      if (typeof record !== 'object' || record === null) continue
      const rec = record as Record<string, unknown>
      const slug = getRecordKey(rec)
      if (slug && slugMap.has(slug)) {
        rec['last_modified'] = slugMap.get(slug)
      }
    }

    saveJson(filePath, file)
  }
  log.info({ files: byFile.size, stamps: stamps.length }, 'stamps applied to seed files')
}

// ─── Pull: Reference tables ─────────────────────────────────────────────────

async function pullReferenceTable<T extends { slug: string; last_modified?: string }>(
  client: pg.PoolClient,
  table: string,
  filePath: string,
  query: string,
  toSeedRecord: (row: Record<string, unknown>) => T,
  getArrayKey: (file: Record<string, unknown>) => T[],
  setArrayKey: (file: Record<string, unknown>, arr: T[]) => void,
  totalKey: string,
): Promise<void> {
  const file = loadJson<Record<string, unknown>>(filePath)
  const records = getArrayKey(file)
  const seedBySlug = new Map(records.map((r) => [r.slug, r]))

  const { rows } = await client.query(query)
  const dbSlugs = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0

  for (const row of rows) {
    const r = row as Record<string, unknown>
    const slug = r['slug'] as string
    dbSlugs.add(slug)
    const dbTime = r['updated_at'] as Date | null
    const seedRecord = seedBySlug.get(slug)

    if (seedRecord && !dbIsNewer(dbTime, seedRecord.last_modified)) {
      skipped++
      continue
    }

    const updated = toSeedRecord(r)
    updated.last_modified = dbTime ? dbTime.toISOString() : new Date().toISOString()

    if (seedRecord) {
      Object.assign(seedRecord, updated)
      pulled++
    } else {
      records.push(updated)
      appended++
    }
  }

  // Warn about seed-only records
  for (const r of records) {
    if (!dbSlugs.has(r.slug)) {
      log.warn({ table, slug: r.slug }, 'seed-only record — exists in seed but not DB')
    }
  }

  // Update metadata total
  const meta = file['_metadata'] as Record<string, unknown>
  meta[totalKey] = records.length
  setArrayKey(file, records)

  saveJson(filePath, file)
  log.info({ table, pulled, appended, skipped }, 'pull')
}

/** All reference tables use ReferenceFile<T> with a `data` array and `total` count. */
async function pullReferenceSimple<T extends { slug: string; last_modified?: string }>(
  client: pg.PoolClient,
  table: string,
  fileName: string,
  query: string,
  toSeedRecord: (row: Record<string, unknown>) => T,
): Promise<void> {
  await pullReferenceTable<T>(
    client, table,
    path.join(SEED_DIR, `reference/${fileName}.json`),
    query, toSeedRecord,
    (f) => (f as unknown as ReferenceFile<T>).data,
    (f, arr) => { (f as unknown as ReferenceFile<T>).data = arr },
    'total',
  )
}

async function pullAllReferenceTables(client: pg.PoolClient): Promise<void> {
  await pullReferenceSimple<FranchiseRecord>(
    client, 'franchises', 'franchises',
    `SELECT slug, name, sort_order, notes, updated_at FROM franchises ORDER BY slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      sort_order: r['sort_order'] as number | null, notes: r['notes'] as string | null }),
  )

  await pullReferenceSimple<ContinuityFamilyRecord>(
    client, 'continuity_families', 'continuity_families',
    `SELECT cf.slug, cf.name, cf.sort_order, cf.notes, cf.updated_at,
            fr.slug AS franchise_slug
     FROM continuity_families cf JOIN franchises fr ON fr.id = cf.franchise_id
     ORDER BY cf.slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      franchise_slug: r['franchise_slug'] as string,
      sort_order: r['sort_order'] as number | null, notes: r['notes'] as string | null }),
  )

  await pullReferenceSimple<FactionRecord>(
    client, 'factions', 'factions',
    `SELECT f.slug, f.name, f.notes, f.updated_at, fr.slug AS franchise_slug
     FROM factions f JOIN franchises fr ON fr.id = f.franchise_id ORDER BY f.slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      franchise_slug: r['franchise_slug'] as string, notes: r['notes'] as string | null }),
  )

  await pullReferenceSimple<SubGroupRecord>(
    client, 'sub_groups', 'sub_groups',
    `SELECT sg.slug, sg.name, sg.notes, sg.updated_at,
            fa.slug AS faction_slug, fr.slug AS franchise_slug
     FROM sub_groups sg
     LEFT JOIN factions fa ON fa.id = sg.faction_id
     JOIN franchises fr ON fr.id = sg.franchise_id ORDER BY sg.slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      faction_slug: r['faction_slug'] as string | null,
      franchise_slug: r['franchise_slug'] as string, notes: r['notes'] as string | null }),
  )

  await pullReferenceSimple<ManufacturerRecord>(
    client, 'manufacturers', 'manufacturers',
    `SELECT slug, name, is_official_licensee, country, website_url, aliases, notes, updated_at
     FROM manufacturers ORDER BY slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      is_official_licensee: r['is_official_licensee'] as boolean,
      country: r['country'] as string | null, website_url: r['website_url'] as string | null,
      aliases: r['aliases'] as string[], notes: r['notes'] as string | null }),
  )

  await pullReferenceSimple<ToyLineRecord>(
    client, 'toy_lines', 'toy_lines',
    `SELECT tl.slug, tl.name, tl.scale, tl.description, tl.updated_at,
            m.slug AS manufacturer_slug, fr.slug AS franchise_slug
     FROM toy_lines tl
     JOIN manufacturers m ON m.id = tl.manufacturer_id
     JOIN franchises fr ON fr.id = tl.franchise_id ORDER BY tl.slug`,
    (r) => ({ slug: r['slug'] as string, name: r['name'] as string,
      manufacturer_slug: r['manufacturer_slug'] as string,
      franchise_slug: r['franchise_slug'] as string,
      scale: r['scale'] as string | null, description: r['description'] as string | null }),
  )
}

// ─── Pull: Characters ───────────────────────────────────────────────────────

async function pullCharacters(client: pg.PoolClient): Promise<void> {
  const charDir = path.join(SEED_DIR, 'characters')
  const charFiles = discoverJsonFiles(charDir)

  // Build slug → {record, filePath} index from all seed files
  const seedIndex = new Map<string, { record: CharacterRecord; filePath: string }>()
  const fileContents = new Map<string, CharacterFile>()
  for (const fp of charFiles) {
    const file = loadJson<CharacterFile>(fp)
    fileContents.set(fp, file)
    for (const c of file.characters) {
      seedIndex.set(c.slug, { record: c, filePath: fp })
    }
  }

  // Query all characters with FK slugs and sub_group_slugs
  const { rows } = await client.query<{
    slug: string; name: string; character_type: string | null; alt_mode: string | null;
    is_combined_form: boolean; search_aliases: string | null;
    metadata: Record<string, unknown>; updated_at: Date;
    franchise_slug: string; faction_slug: string | null; continuity_family_slug: string;
    sub_group_slugs: string[];
  }>(`SELECT c.slug, c.name, c.character_type, c.alt_mode, c.is_combined_form,
            c.search_aliases, c.metadata, c.updated_at,
            fr.slug AS franchise_slug, fa.slug AS faction_slug,
            cf.slug AS continuity_family_slug,
            COALESCE(array_agg(sg.slug ORDER BY sg.slug) FILTER (WHERE sg.slug IS NOT NULL), '{}') AS sub_group_slugs
     FROM characters c
     JOIN franchises fr ON fr.id = c.franchise_id
     LEFT JOIN factions fa ON fa.id = c.faction_id
     JOIN continuity_families cf ON cf.id = c.continuity_family_id
     LEFT JOIN character_sub_groups csg ON csg.character_id = c.id
     LEFT JOIN sub_groups sg ON sg.id = csg.sub_group_id
     GROUP BY c.slug, c.name, c.character_type, c.alt_mode, c.is_combined_form,
              c.search_aliases, c.metadata, c.updated_at, fr.slug, fa.slug, cf.slug
     ORDER BY c.slug`)

  const dbSlugs = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0
  const modifiedFiles = new Set<string>()

  for (const row of rows) {
    dbSlugs.add(row.slug)
    const entry = seedIndex.get(row.slug)
    const seedTime = entry?.record.last_modified

    if (entry && !dbIsNewer(row.updated_at, seedTime)) {
      skipped++
      continue
    }

    const meta = disassembleCharacterMetadata(row.metadata)
    const updated: CharacterRecord = {
      name: row.name, slug: row.slug, franchise_slug: row.franchise_slug,
      faction_slug: row.faction_slug, character_type: row.character_type,
      alt_mode: row.alt_mode, is_combined_form: row.is_combined_form,
      continuity_family_slug: row.continuity_family_slug,
      sub_group_slugs: row.sub_group_slugs,
      search_aliases: row.search_aliases,
      notes: meta.notes, series_year: meta.series_year, year_released: meta.year_released,
      last_modified: row.updated_at.toISOString(),
    }

    if (entry) {
      Object.assign(entry.record, updated)
      modifiedFiles.add(entry.filePath)
      pulled++
    } else {
      // Append to first file or create overflow file
      const targetFile = charFiles[0] ?? path.join(charDir, 'from-db.json')
      let fc = fileContents.get(targetFile)
      if (!fc) {
        fc = { _metadata: { total_characters: 0 }, characters: [] }
        fileContents.set(targetFile, fc)
      }
      fc.characters.push(updated)
      modifiedFiles.add(targetFile)
      appended++
    }
  }

  // Warn about seed-only
  for (const [slug] of seedIndex) {
    if (!dbSlugs.has(slug)) {
      log.warn({ table: 'characters', slug }, 'seed-only record')
    }
  }

  // Write modified files
  for (const fp of modifiedFiles) {
    const fc = fileContents.get(fp)!
    fc._metadata.total_characters = fc.characters.length
    saveJson(fp, fc)
  }
  log.info({ table: 'characters', pulled, appended, skipped }, 'pull')
}

// ─── Pull: Appearances ──────────────────────────────────────────────────────

async function pullAppearances(client: pg.PoolClient): Promise<void> {
  const appDir = path.join(SEED_DIR, 'appearances')
  const appFiles = discoverJsonFiles(appDir)

  const seedIndex = new Map<string, { record: AppearanceRecord; filePath: string }>()
  const fileContents = new Map<string, AppearanceFile>()
  for (const fp of appFiles) {
    const file = loadJson<AppearanceFile>(fp)
    fileContents.set(fp, file)
    for (const a of file.data) {
      seedIndex.set(a.slug, { record: a, filePath: fp })
    }
  }

  const { rows } = await client.query<{
    slug: string; name: string; description: string | null;
    source_media: string | null; source_name: string | null;
    year_start: number | null; year_end: number | null;
    metadata: Record<string, unknown>; updated_at: Date; character_slug: string;
  }>(`SELECT ca.slug, ca.name, ca.description, ca.source_media, ca.source_name,
            ca.year_start, ca.year_end, ca.metadata, ca.updated_at,
            c.slug AS character_slug
     FROM character_appearances ca
     JOIN characters c ON c.id = ca.character_id
     ORDER BY ca.slug`)

  const dbSlugs = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0
  const modifiedFiles = new Set<string>()

  for (const row of rows) {
    dbSlugs.add(row.slug)
    const entry = seedIndex.get(row.slug)
    if (entry && !dbIsNewer(row.updated_at, entry.record.last_modified)) {
      skipped++
      continue
    }

    const updated: AppearanceRecord = {
      slug: row.slug, name: row.name, character_slug: row.character_slug,
      description: row.description, source_media: row.source_media,
      source_name: row.source_name, year_start: row.year_start,
      year_end: row.year_end, metadata: row.metadata ?? {},
      last_modified: row.updated_at.toISOString(),
    }

    if (entry) {
      Object.assign(entry.record, updated)
      modifiedFiles.add(entry.filePath)
      pulled++
    } else {
      const targetFile = appFiles[0] ?? path.join(appDir, 'from-db.json')
      let fc = fileContents.get(targetFile)
      if (!fc) {
        fc = { _metadata: { total: 0 }, data: [] }
        fileContents.set(targetFile, fc)
      }
      fc.data.push(updated)
      modifiedFiles.add(targetFile)
      appended++
    }
  }

  for (const [slug] of seedIndex) {
    if (!dbSlugs.has(slug)) log.warn({ table: 'character_appearances', slug }, 'seed-only record')
  }

  for (const fp of modifiedFiles) {
    const fc = fileContents.get(fp)!
    fc._metadata.total = fc.data.length
    saveJson(fp, fc)
  }
  log.info({ table: 'character_appearances', pulled, appended, skipped }, 'pull')
}

// ─── Pull: Items ────────────────────────────────────────────────────────────

async function pullItems(client: pg.PoolClient): Promise<void> {
  const itemDir = path.join(SEED_DIR, 'items')
  const itemFiles = discoverJsonFilesRecursive(itemDir)

  const seedIndex = new Map<string, { record: ItemRecord; filePath: string }>()
  const fileContents = new Map<string, ItemFile>()
  for (const fp of itemFiles) {
    const file = loadJson<ItemFile>(fp)
    fileContents.set(fp, file)
    if (!Array.isArray(file.items)) continue
    for (const item of file.items) {
      seedIndex.set(item.slug, { record: item, filePath: fp })
    }
  }

  const { rows } = await client.query<{
    slug: string; name: string; product_code: string | null;
    year_released: number | null; is_third_party: boolean; size_class: string | null;
    search_aliases: string | null; metadata: Record<string, unknown>; updated_at: Date;
    manufacturer_slug: string; toy_line_slug: string;
    character_slug: string | null; character_appearance_slug: string | null;
  }>(`SELECT i.slug, i.name, i.product_code, i.year_released, i.is_third_party,
            i.size_class, i.search_aliases, i.metadata, i.updated_at,
            mfr.slug AS manufacturer_slug, tl.slug AS toy_line_slug,
            c.slug AS character_slug, ca.slug AS character_appearance_slug
     FROM items i
     JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
     JOIN toy_lines tl ON tl.id = i.toy_line_id
     LEFT JOIN item_character_depictions icd ON icd.item_id = i.id AND icd.is_primary = TRUE
     LEFT JOIN character_appearances ca ON ca.id = icd.appearance_id
     LEFT JOIN characters c ON c.id = ca.character_id
     ORDER BY i.slug`)

  const dbSlugs = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0
  const modifiedFiles = new Set<string>()

  for (const row of rows) {
    dbSlugs.add(row.slug)
    const entry = seedIndex.get(row.slug)
    if (entry && !dbIsNewer(row.updated_at, entry.record.last_modified)) {
      skipped++
      continue
    }

    const updated: ItemRecord = {
      name: row.name, slug: row.slug, product_code: row.product_code,
      character_slug: row.character_slug ?? '',
      character_appearance_slug: row.character_appearance_slug,
      manufacturer_slug: row.manufacturer_slug, toy_line_slug: row.toy_line_slug,
      is_third_party: row.is_third_party, year_released: row.year_released,
      size_class: row.size_class, search_aliases: row.search_aliases,
      metadata: row.metadata ?? {},
      last_modified: row.updated_at.toISOString(),
    }

    if (entry) {
      Object.assign(entry.record, updated)
      modifiedFiles.add(entry.filePath)
      pulled++
    } else {
      const targetFile = itemFiles[0] ?? path.join(itemDir, 'from-db.json')
      let fc = fileContents.get(targetFile)
      if (!fc) {
        fc = { _metadata: { total_items: 0 }, items: [] }
        fileContents.set(targetFile, fc)
      }
      fc.items.push(updated)
      modifiedFiles.add(targetFile)
      appended++
    }
  }

  for (const [slug] of seedIndex) {
    if (!dbSlugs.has(slug)) log.warn({ table: 'items', slug }, 'seed-only record')
  }

  for (const fp of modifiedFiles) {
    const fc = fileContents.get(fp)!
    fc._metadata.total_items = fc.items.length
    saveJson(fp, fc)
  }
  log.info({ table: 'items', pulled, appended, skipped }, 'pull')
}

// ─── Pull: Character relationships ──────────────────────────────────────────

async function pullCharacterRelationships(client: pg.PoolClient): Promise<void> {
  const relDir = path.join(SEED_DIR, 'relationships')
  const relFiles = discoverJsonFiles(relDir)

  const seedIndex = new Map<string, { record: RelationshipRecord; filePath: string }>()
  const fileContents = new Map<string, RelationshipFile>()

  for (const fp of relFiles) {
    const file = loadJson<RelationshipFile>(fp)
    fileContents.set(fp, file)
    for (const r of file.relationships) {
      const key = `${r.type}:${r.entity1.slug}:${r.entity2.slug}`
      seedIndex.set(key, { record: r, filePath: fp })
    }
  }

  const charReverseMap = await buildReverseSlugMap(client, 'characters')

  const { rows } = await client.query<{
    type: string; subtype: string | null;
    entity1_id: string; entity1_role: string | null;
    entity2_id: string; entity2_role: string | null;
    metadata: Record<string, unknown>; updated_at: Date;
  }>(`SELECT type, subtype, entity1_id, entity1_role, entity2_id, entity2_role,
            metadata, updated_at
     FROM character_relationships ORDER BY type, entity1_id`)

  const dbKeys = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0
  const modifiedFiles = new Set<string>()

  for (const row of rows) {
    const e1Slug = charReverseMap.get(row.entity1_id)
    const e2Slug = charReverseMap.get(row.entity2_id)
    if (!e1Slug || !e2Slug) continue

    const key = `${row.type}:${e1Slug}:${e2Slug}`
    dbKeys.add(key)
    const entry = seedIndex.get(key)

    if (entry && !dbIsNewer(row.updated_at, entry.record.last_modified)) {
      skipped++
      continue
    }

    const updated: RelationshipRecord = {
      type: row.type, subtype: row.subtype,
      entity1: { slug: e1Slug, role: row.entity1_role },
      entity2: { slug: e2Slug, role: row.entity2_role },
      metadata: row.metadata ?? {},
      last_modified: row.updated_at.toISOString(),
    }

    if (entry) {
      Object.assign(entry.record, updated)
      modifiedFiles.add(entry.filePath)
      pulled++
    } else {
      const targetFile = relFiles[0] ?? path.join(relDir, 'from-db.json')
      let fc = fileContents.get(targetFile)
      if (!fc) {
        fc = { _metadata: { total: 0 }, relationships: [] }
        fileContents.set(targetFile, fc)
      }
      fc.relationships.push(updated)
      modifiedFiles.add(targetFile)
      appended++
    }
  }

  for (const [key] of seedIndex) {
    if (!dbKeys.has(key)) log.warn({ table: 'character_relationships', key }, 'seed-only record')
  }

  for (const fp of modifiedFiles) {
    const fc = fileContents.get(fp)!
    fc._metadata.total = fc.relationships.length
    saveJson(fp, fc)
  }
  log.info({ table: 'character_relationships', pulled, appended, skipped }, 'pull')
}

// ─── Pull: Item relationships ───────────────────────────────────────────────

async function pullItemRelationships(client: pg.PoolClient): Promise<void> {
  const relDir = path.join(SEED_DIR, 'item_relationships')
  const relFiles = discoverJsonFiles(relDir)

  const seedIndex = new Map<string, { record: ItemRelationshipRecord; filePath: string }>()
  const fileContents = new Map<string, ItemRelationshipFile>()

  for (const fp of relFiles) {
    const file = loadJson<ItemRelationshipFile>(fp)
    fileContents.set(fp, file)
    for (const r of file.item_relationships) {
      const key = `${r.type}:${r.item1_slug}:${r.item2_slug}`
      seedIndex.set(key, { record: r, filePath: fp })
    }
  }

  const itemReverseMap = await buildReverseSlugMap(client, 'items')

  const { rows } = await client.query<{
    type: string; subtype: string | null;
    item1_id: string; item1_role: string | null;
    item2_id: string; item2_role: string | null;
    metadata: Record<string, unknown>; updated_at: Date;
  }>(`SELECT type, subtype, item1_id, item1_role, item2_id, item2_role,
            metadata, updated_at
     FROM item_relationships ORDER BY type, item1_id`)

  const dbKeys = new Set<string>()
  let pulled = 0, appended = 0, skipped = 0
  const modifiedFiles = new Set<string>()

  for (const row of rows) {
    const i1Slug = itemReverseMap.get(row.item1_id)
    const i2Slug = itemReverseMap.get(row.item2_id)
    if (!i1Slug || !i2Slug) continue

    const key = `${row.type}:${i1Slug}:${i2Slug}`
    dbKeys.add(key)
    const entry = seedIndex.get(key)

    if (entry && !dbIsNewer(row.updated_at, entry.record.last_modified)) {
      skipped++
      continue
    }

    const updated: ItemRelationshipRecord = {
      type: row.type, subtype: row.subtype,
      item1_slug: i1Slug, item1_role: row.item1_role,
      item2_slug: i2Slug, item2_role: row.item2_role,
      metadata: row.metadata ?? {},
      last_modified: row.updated_at.toISOString(),
    }

    if (entry) {
      Object.assign(entry.record, updated)
      modifiedFiles.add(entry.filePath)
      pulled++
    } else {
      const targetFile = relFiles[0] ?? path.join(relDir, 'from-db.json')
      let fc = fileContents.get(targetFile)
      if (!fc) {
        fc = { _metadata: { total: 0 }, item_relationships: [] }
        fileContents.set(targetFile, fc)
      }
      fc.item_relationships.push(updated)
      modifiedFiles.add(targetFile)
      appended++
    }
  }

  for (const [key] of seedIndex) {
    if (!dbKeys.has(key)) log.warn({ table: 'item_relationships', key }, 'seed-only record')
  }

  for (const fp of modifiedFiles) {
    const fc = fileContents.get(fp)!
    fc._metadata.total = fc.item_relationships.length
    saveJson(fp, fc)
  }
  log.info({ table: 'item_relationships', pulled, appended, skipped }, 'pull')
}

// ─── Pull orchestration ─────────────────────────────────────────────────────

async function runPull(client: pg.PoolClient): Promise<void> {
  await pullAllReferenceTables(client)
  await pullCharacters(client)
  await pullAppearances(client)
  await pullCharacterRelationships(client)
  await pullItems(client)
  await pullItemRelationships(client)
}

// ─── Helpers for applyStamps ────────────────────────────────────────────────

/** Known array keys in seed file wrappers. Order matters — first match wins. */
const RECORD_ARRAY_KEYS = ['data', 'characters', 'items', 'relationships', 'item_relationships'] as const

function findRecordArray(file: Record<string, unknown>): unknown[] | null {
  for (const key of RECORD_ARRAY_KEYS) {
    if (Array.isArray(file[key])) return file[key] as unknown[]
  }
  return null
}

function getRecordKey(rec: Record<string, unknown>): string | null {
  if (typeof rec['slug'] === 'string') return rec['slug']
  if (typeof rec['type'] !== 'string') return null

  // Character relationships: nested entity objects
  const e1 = rec['entity1'] as Record<string, unknown> | undefined
  const e2 = rec['entity2'] as Record<string, unknown> | undefined
  if (e1?.['slug'] && e2?.['slug']) return `${rec['type']}:${e1['slug']}:${e2['slug']}`

  // Item relationships: flat slug fields
  if (typeof rec['item1_slug'] === 'string' && typeof rec['item2_slug'] === 'string') {
    return `${rec['type']}:${rec['item1_slug']}:${rec['item2_slug']}`
  }

  return null
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const doPush = args.includes('--push')
  const doPull = args.includes('--pull')

  if (!doPush && !doPull) {
    log.fatal('Must specify --push, --pull, or both')
    process.exit(1)
  }

  log.info({ seedDir: SEED_DIR, push: doPush, pull: doPull }, 'sync starting')

  const client = await pool.connect()
  try {
    if (doPush) {
      await client.query('BEGIN')
      try {
        const stamps = await runPush(client)
        await client.query('COMMIT')
        log.info('push committed')
        // Apply last_modified stamps after successful COMMIT
        if (stamps.length > 0) {
          applyStamps(stamps)
        }
      } catch (err) {
        try { await client.query('ROLLBACK') } catch { /* ignore */ }
        log.error({ err }, 'push failed — rolled back')
        throw err
      }
    }

    if (doPull) {
      await runPull(client)
      log.info('pull complete')
    }

    log.info('sync complete')
  } catch (err) {
    log.error({ err }, 'sync failed')
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
