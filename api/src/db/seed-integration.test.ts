/**
 * Seed data integration tests — runs the seed ingestion script against a real
 * PostgreSQL database and verifies the seeded data is correct.
 *
 * Requires a running PostgreSQL instance with migrations applied.
 * Skipped automatically when DATABASE_URL is not set.
 *
 * Companion to seed-validation.test.ts (static JSON checks, no DB).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_URL = process.env['DATABASE_URL']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_DIR = path.resolve(__dirname, '../../')

const CATALOG_TABLES = [
  'continuity_families', 'factions', 'sub_groups', 'manufacturers',
  'toy_lines', 'characters', 'character_sub_groups',
  'character_appearances', 'items',
] as const
type CatalogTable = typeof CATALOG_TABLES[number]

const SLUG_TABLES: CatalogTable[] = [
  'continuity_families', 'factions', 'sub_groups', 'manufacturers',
  'toy_lines', 'characters', 'character_appearances', 'items',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

// Commands are hardcoded literals — no user input, no injection risk.
// execSync is used intentionally to run the CLI script as it would in production.

function runSeed(npmScript: 'seed' | 'seed:purge'): void {
  try {
    execSync(`npm run ${npmScript}`, {
      cwd: API_DIR,
      env: { ...process.env },
      stdio: 'pipe',
    })
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `${npmScript} failed:\n${e.stderr?.toString() ?? ''}\n${e.stdout?.toString() ?? ''}`,
      { cause: err },
    )
  }
}

async function queryCount(pool: pg.Pool, table: CatalogTable): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ${table}`,
  )
  return Number(rows[0]!.count)
}

async function queryOrphanedFKs(
  pool: pg.Pool,
  childTable: CatalogTable,
  childCol: string,
  parentTable: CatalogTable,
): Promise<string[]> {
  // For junction table character_sub_groups (no slug column), return character_id::text
  const identCol = childTable === 'character_sub_groups' ? `c.${childCol}::text` : 'c.slug'
  const { rows } = await pool.query<{ slug: string }>(
    `SELECT ${identCol} AS slug
     FROM ${childTable} c
     LEFT JOIN ${parentTable} p ON c.${childCol} = p.id
     WHERE c.${childCol} IS NOT NULL AND p.id IS NULL`,
  )
  return rows.map((r) => r.slug)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe.skipIf(!DB_URL)('seed integration', () => {
  let pool: pg.Pool

  // ── 0. Setup & teardown ─────────────────────────────────────────────────

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DB_URL!, max: 2 })
    runSeed('seed:purge')
  }, 90_000)

  afterAll(async () => {
    await pool.query(
      `TRUNCATE items, character_appearances, character_sub_groups,
               characters, toy_lines, manufacturers,
               sub_groups, factions, continuity_families
       CASCADE`,
    )
    await pool.end()
  })

  // ── 1. Row counts ──────────────────────────────────────────────────────

  describe('row counts', () => {
    it.each([
      { table: 'continuity_families' as CatalogTable, expected: 10 },
      { table: 'factions' as CatalogTable, expected: 11 },
      { table: 'sub_groups' as CatalogTable, expected: 52 },
      { table: 'manufacturers' as CatalogTable, expected: 3 },
      { table: 'toy_lines' as CatalogTable, expected: 16 },
    ])('$table has $expected rows (reference)', async ({ table, expected }) => {
      const count = await queryCount(pool, table)
      expect(count, `${table} row count`).toBe(expected)
    })

    it.each([
      { table: 'characters' as CatalogTable, expected: 440 },
      { table: 'character_sub_groups' as CatalogTable, expected: 328 },
      { table: 'character_appearances' as CatalogTable, expected: 508 },
      { table: 'items' as CatalogTable, expected: 395 },
    ])('$table has $expected rows (entities)', async ({ table, expected }) => {
      const count = await queryCount(pool, table)
      expect(count, `${table} row count`).toBe(expected)
    })
  })

  // ── 2. No duplicate slugs ─────────────────────────────────────────────

  describe('no duplicate slugs', () => {
    it.each(SLUG_TABLES.map((t) => ({ table: t })))(
      '$table has no duplicate slugs',
      async ({ table }) => {
        const { rows } = await pool.query<{ slug: string; cnt: string }>(
          `SELECT slug, COUNT(*) AS cnt FROM ${table} GROUP BY slug HAVING COUNT(*) > 1`,
        )
        expect(rows, `${table}: found duplicate slugs: ${rows.map((r) => r.slug).join(', ')}`).toHaveLength(0)
      },
    )
  })

  // ── 3. FK referential integrity ───────────────────────────────────────

  describe('FK referential integrity', () => {
    it('sub_groups.faction_id → factions', async () => {
      expect(await queryOrphanedFKs(pool, 'sub_groups', 'faction_id', 'factions')).toEqual([])
    })

    it('toy_lines.manufacturer_id → manufacturers', async () => {
      expect(await queryOrphanedFKs(pool, 'toy_lines', 'manufacturer_id', 'manufacturers')).toEqual([])
    })

    it('characters.faction_id → factions', async () => {
      expect(await queryOrphanedFKs(pool, 'characters', 'faction_id', 'factions')).toEqual([])
    })

    it('characters.continuity_family_id → continuity_families', async () => {
      expect(await queryOrphanedFKs(pool, 'characters', 'continuity_family_id', 'continuity_families')).toEqual([])
    })

    it('characters.combined_form_id → characters (self-ref)', async () => {
      expect(await queryOrphanedFKs(pool, 'characters', 'combined_form_id', 'characters')).toEqual([])
    })

    it('character_sub_groups.character_id → characters', async () => {
      expect(await queryOrphanedFKs(pool, 'character_sub_groups', 'character_id', 'characters')).toEqual([])
    })

    it('character_sub_groups.sub_group_id → sub_groups', async () => {
      expect(await queryOrphanedFKs(pool, 'character_sub_groups', 'sub_group_id', 'sub_groups')).toEqual([])
    })

    it('character_appearances.character_id → characters', async () => {
      expect(await queryOrphanedFKs(pool, 'character_appearances', 'character_id', 'characters')).toEqual([])
    })

    it('items.manufacturer_id → manufacturers', async () => {
      expect(await queryOrphanedFKs(pool, 'items', 'manufacturer_id', 'manufacturers')).toEqual([])
    })

    it('items.toy_line_id → toy_lines', async () => {
      expect(await queryOrphanedFKs(pool, 'items', 'toy_line_id', 'toy_lines')).toEqual([])
    })

    it('items.character_id → characters', async () => {
      expect(await queryOrphanedFKs(pool, 'items', 'character_id', 'characters')).toEqual([])
    })

    it('items.character_appearance_id → character_appearances', async () => {
      expect(await queryOrphanedFKs(pool, 'items', 'character_appearance_id', 'character_appearances')).toEqual([])
    })
  })

  // ── 4. Combiner relationships ─────────────────────────────────────────

  describe('combiner relationships', () => {
    it('Devastator has exactly 6 Constructicon components', async () => {
      const { rows } = await pool.query<{ slug: string }>(
        `SELECT c.slug FROM characters c
         JOIN characters form ON form.id = c.combined_form_id
         WHERE form.slug = 'devastator'
         ORDER BY c.slug`,
      )
      expect(rows.map((r) => r.slug)).toEqual([
        'bonecrusher', 'hook', 'long-haul', 'mixmaster', 'scavenger', 'scrapper',
      ])
    })

    it.each([
      { combiner: 'superion', expected: 5 },
      { combiner: 'menasor', expected: 5 },
      { combiner: 'bruticus', expected: 5 },
      { combiner: 'defensor', expected: 5 },
    ])('$combiner has $expected components', async ({ combiner, expected }) => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM characters c
         JOIN characters form ON form.id = c.combined_form_id
         WHERE form.slug = $1`,
        [combiner],
      )
      expect(Number(rows[0]!.count), `${combiner} component count`).toBe(expected)
    })

    it('all combined_form_id targets have is_combined_form = true', async () => {
      const { rows } = await pool.query<{ slug: string }>(
        `SELECT DISTINCT form.slug FROM characters c
         JOIN characters form ON form.id = c.combined_form_id
         WHERE form.is_combined_form = false`,
      )
      expect(
        rows,
        `Characters referenced as combined forms but with is_combined_form=false: ${rows.map((r) => r.slug).join(', ')}`,
      ).toHaveLength(0)
    })
  })

  // ── 5. Junction table: character_sub_groups ───────────────────────────

  describe('junction table: character_sub_groups', () => {
    it('Apeface belongs to both headmasters and horrorcons', async () => {
      const { rows } = await pool.query<{ slug: string }>(
        `SELECT sg.slug FROM character_sub_groups csg
         JOIN characters c ON c.id = csg.character_id
         JOIN sub_groups sg ON sg.id = csg.sub_group_id
         WHERE c.slug = 'apeface'
         ORDER BY sg.slug`,
      )
      const slugs = rows.map((r) => r.slug)
      expect(slugs).toContain('headmasters')
      expect(slugs).toContain('horrorcons')
    })

    it('no orphaned junction rows', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM character_sub_groups csg
         LEFT JOIN characters c ON c.id = csg.character_id
         LEFT JOIN sub_groups sg ON sg.id = csg.sub_group_id
         WHERE c.id IS NULL OR sg.id IS NULL`,
      )
      expect(Number(rows[0]!.count)).toBe(0)
    })
  })

  // ── 6. Item data correctness ──────────────────────────────────────────

  describe('item data correctness', () => {
    it('FansToys items: all have is_third_party = true', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         WHERE m.slug = 'fanstoys' AND i.is_third_party = false`,
      )
      expect(Number(rows[0]!.count), 'FansToys items with is_third_party=false').toBe(0)
    })

    it('FansToys item count is 118', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         WHERE m.slug = 'fanstoys'`,
      )
      expect(Number(rows[0]!.count)).toBe(118)
    })

    it('Hasbro items: all have is_third_party = false', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         WHERE m.slug = 'hasbro' AND i.is_third_party = true`,
      )
      expect(Number(rows[0]!.count), 'Hasbro items with is_third_party=true').toBe(0)
    })

    it('Hasbro item count is 277', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         WHERE m.slug = 'hasbro'`,
      )
      expect(Number(rows[0]!.count)).toBe(277)
    })

    it('FT-01 MP-1 Trailer has correct fields', async () => {
      const { rows } = await pool.query<{
        slug: string
        is_third_party: boolean
        year_released: number
        size_class: string
        manufacturer_slug: string
        character_slug: string
        metadata: Record<string, unknown>
      }>(
        `SELECT i.slug, i.is_third_party, i.year_released, i.size_class,
                m.slug AS manufacturer_slug, c.slug AS character_slug,
                i.metadata
         FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         JOIN characters c ON c.id = i.character_id
         WHERE i.slug = 'ft-01-mp-1-trailer'`,
      )
      expect(rows).toHaveLength(1)
      const item = rows[0]!
      expect(item.is_third_party).toBe(true)
      expect(item.year_released).toBe(2006)
      expect(item.size_class).toBe('Masterpiece')
      expect(item.manufacturer_slug).toBe('fanstoys')
      expect(item.character_slug).toBe('optimus-prime')
      expect(item.metadata).toHaveProperty('status')
      expect(item.metadata).toHaveProperty('sub_brand')
    })

    it('Hasbro Bumblebee (05701) has correct fields', async () => {
      const { rows } = await pool.query<{
        slug: string
        is_third_party: boolean
        year_released: number
        manufacturer_slug: string
        character_slug: string
      }>(
        `SELECT i.slug, i.is_third_party, i.year_released,
                m.slug AS manufacturer_slug, c.slug AS character_slug
         FROM items i
         JOIN manufacturers m ON m.id = i.manufacturer_id
         JOIN characters c ON c.id = i.character_id
         WHERE i.slug = '05701-bumblebee'`,
      )
      expect(rows).toHaveLength(1)
      const item = rows[0]!
      expect(item.is_third_party).toBe(false)
      expect(item.year_released).toBe(1984)
      expect(item.manufacturer_slug).toBe('hasbro')
      expect(item.character_slug).toBe('bumblebee')
    })

    it('items with character_slug optimus-prime have valid character_id', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM items i
         JOIN characters c ON c.id = i.character_id
         WHERE c.slug = 'optimus-prime'`,
      )
      expect(Number(rows[0]!.count)).toBeGreaterThan(0)
    })
  })

  // ── 7. Idempotency ────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('purge + re-seed produces identical row counts', async () => {
      // Capture counts from the initial seed (already run in beforeAll)
      const countsBefore: Record<string, number> = {}
      for (const table of CATALOG_TABLES) {
        countsBefore[table] = await queryCount(pool, table)
      }
      expect(countsBefore['characters'], 'precondition: DB must have seed data').toBeGreaterThan(0)

      // Run purge + re-seed (seed:purge does TRUNCATE then full seed in one transaction)
      runSeed('seed:purge')

      // Verify counts are identical
      const countsAfter: Record<string, number> = {}
      for (const table of CATALOG_TABLES) {
        countsAfter[table] = await queryCount(pool, table)
      }

      expect(countsAfter).toEqual(countsBefore)
    }, 90_000)

    it('upsert mode (no purge) produces identical row counts', async () => {
      const countsBefore: Record<string, number> = {}
      for (const table of CATALOG_TABLES) {
        countsBefore[table] = await queryCount(pool, table)
      }
      expect(countsBefore['characters'], 'precondition: DB must have seed data').toBeGreaterThan(0)

      // Run upsert mode (no --purge)
      runSeed('seed')

      const countsAfter: Record<string, number> = {}
      for (const table of CATALOG_TABLES) {
        countsAfter[table] = await queryCount(pool, table)
      }

      expect(countsAfter).toEqual(countsBefore)
    }, 90_000)
  })
})
