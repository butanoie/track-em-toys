/**
 * Shared I/O helpers for seed data ingestion and sync.
 * Used by both ingest.ts and sync.ts.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { CharacterRecord } from './seed-types.js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

// ─── Seed directory resolution ──────────────────────────────────────────────

export function resolveSeedDir(): string {
  return process.env['SEED_DATA_PATH']
    ? path.resolve(process.env['SEED_DATA_PATH'])
    : path.join(SCRIPT_DIR, 'sample')
}

// ─── File I/O ───────────────────────────────────────────────────────────────

export function loadJson<T>(filePath: string): T {
  // Files validated by seed-validation.test.ts before ingest runs
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`loadJson: expected object in ${filePath}`)
  }
  return raw as T
}

/** Atomic JSON write — writes to .tmp then renames to prevent corruption. */
export function saveJson(filePath: string, data: unknown): void {
  const content = JSON.stringify(data, null, 2) + '\n'
  const tmpPath = path.join(os.tmpdir(), `seed-sync-${Date.now()}-${path.basename(filePath)}`)
  fs.writeFileSync(tmpPath, content, 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

export function discoverJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f))
}

export function discoverJsonFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f))
}

// ─── Slug resolution ────────────────────────────────────────────────────────

export function resolveSlug(
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

export function resolveOptionalSlug(
  map: Map<string, string>,
  slug: string | null,
  context: string,
): string | null {
  if (slug === null || slug === undefined) return null
  return resolveSlug(map, slug, context)
}

// ─── Slug maps ──────────────────────────────────────────────────────────────

/** Allowed tables for slug map queries — prevents SQL injection. */
const SLUG_TABLES = new Set([
  'franchises',
  'continuity_families',
  'factions',
  'sub_groups',
  'manufacturers',
  'toy_lines',
  'characters',
  'character_appearances',
  'items',
])

/** Build slug → UUID map from a catalog table. */
export async function buildSlugMap(
  client: pg.PoolClient,
  table: string,
): Promise<Map<string, string>> {
  if (!SLUG_TABLES.has(table)) {
    throw new Error(`buildSlugMap: unexpected table "${table}"`)
  }
  const { rows } = await client.query<{ slug: string; id: string }>(
    `SELECT slug, id FROM ${pg.escapeIdentifier(table)}`,
  )
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.slug, row.id)
  }
  return map
}

/** Build UUID → slug reverse map from a catalog table. */
export async function buildReverseSlugMap(
  client: pg.PoolClient,
  table: string,
): Promise<Map<string, string>> {
  if (!SLUG_TABLES.has(table)) {
    throw new Error(`buildReverseSlugMap: unexpected table "${table}"`)
  }
  const { rows } = await client.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM ${pg.escapeIdentifier(table)}`,
  )
  const map = new Map<string, string>()
  for (const row of rows) {
    map.set(row.id, row.slug)
  }
  return map
}

// ─── Character metadata assembly/disassembly ────────────────────────────────

/** Pack notes, series_year, year_released into JSONB metadata for DB storage. */
export function assembleCharacterMetadata(char: CharacterRecord): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  if (char.notes != null) metadata['notes'] = char.notes
  if (char.series_year != null) metadata['series_year'] = char.series_year
  if (char.year_released != null) metadata['year_released'] = char.year_released
  return metadata
}

/** Unpack JSONB metadata back to top-level fields for seed JSON. */
export function disassembleCharacterMetadata(
  metadata: Record<string, unknown> | null,
): { notes: string | null; series_year: string | null; year_released: number | null } {
  if (!metadata) return { notes: null, series_year: null, year_released: null }
  return {
    notes: typeof metadata['notes'] === 'string' ? metadata['notes'] : null,
    series_year: typeof metadata['series_year'] === 'string' ? metadata['series_year'] : null,
    year_released: typeof metadata['year_released'] === 'number' ? metadata['year_released'] : null,
  }
}

// ─── Timestamp comparison ───────────────────────────────────────────────────

/** Returns true if the seed record is newer than the DB record. */
export function seedIsNewer(seedTime: string | undefined, dbTime: Date | null): boolean {
  if (!seedTime) return false // no last_modified → seed is infinitely old
  if (!dbTime) return true // no DB record → seed wins
  return new Date(seedTime) > dbTime
}

/** Returns true if the DB record is newer than the seed record. */
export function dbIsNewer(dbTime: Date | null, seedTime: string | undefined): boolean {
  if (!dbTime) return false // no DB record → can't be newer
  if (!seedTime) return true // no last_modified → DB wins
  return dbTime > new Date(seedTime)
}
