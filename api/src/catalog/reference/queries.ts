import { pool } from '../../db/pool.js'

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

export interface FactionRow {
  id: string
  name: string
  slug: string
  notes: string | null
  created_at: string
}

/**
 * List factions for a franchise.
 *
 * @param franchiseSlug - Franchise slug filter
 */
export async function listFactions(franchiseSlug: string): Promise<FactionRow[]> {
  const { rows } = await pool.query<FactionRow>(
    `SELECT f.id, f.name, f.slug, f.notes, f.created_at
       FROM factions f
       JOIN franchises fr ON fr.id = f.franchise_id
      WHERE fr.slug = $1
      ORDER BY f.sort_order ASC NULLS LAST, f.name ASC`,
    [franchiseSlug],
  )
  return rows
}

/**
 * Fetch a single faction by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param factionSlug - Faction slug to look up
 */
export async function getFactionBySlug(
  franchiseSlug: string,
  factionSlug: string,
): Promise<FactionRow | null> {
  const { rows } = await pool.query<FactionRow>(
    `SELECT f.id, f.name, f.slug, f.notes, f.created_at
       FROM factions f
       JOIN franchises fr ON fr.id = f.franchise_id
      WHERE fr.slug = $1 AND f.slug = $2`,
    [franchiseSlug, factionSlug],
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Sub-Groups
// ---------------------------------------------------------------------------

export interface SubGroupRow {
  id: string
  name: string
  slug: string
  faction_slug: string | null
  faction_name: string | null
  notes: string | null
  created_at: string
}

/**
 * List sub-groups for a franchise.
 *
 * @param franchiseSlug - Franchise slug filter
 */
export async function listSubGroups(franchiseSlug: string): Promise<SubGroupRow[]> {
  const { rows } = await pool.query<SubGroupRow>(
    `SELECT sg.id, sg.name, sg.slug, sg.notes, sg.created_at,
            fa.slug AS faction_slug, fa.name AS faction_name
       FROM sub_groups sg
       JOIN franchises fr ON fr.id = sg.franchise_id
       LEFT JOIN factions fa ON fa.id = sg.faction_id
      WHERE fr.slug = $1
      ORDER BY sg.sort_order ASC NULLS LAST, sg.name ASC`,
    [franchiseSlug],
  )
  return rows
}

/**
 * Fetch a single sub-group by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param subGroupSlug - Sub-group slug to look up
 */
export async function getSubGroupBySlug(
  franchiseSlug: string,
  subGroupSlug: string,
): Promise<SubGroupRow | null> {
  const { rows } = await pool.query<SubGroupRow>(
    `SELECT sg.id, sg.name, sg.slug, sg.notes, sg.created_at,
            fa.slug AS faction_slug, fa.name AS faction_name
       FROM sub_groups sg
       JOIN franchises fr ON fr.id = sg.franchise_id
       LEFT JOIN factions fa ON fa.id = sg.faction_id
      WHERE fr.slug = $1 AND sg.slug = $2`,
    [franchiseSlug, subGroupSlug],
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Continuity Families
// ---------------------------------------------------------------------------

export interface ContinuityFamilyRow {
  id: string
  slug: string
  name: string
  sort_order: number | null
  notes: string | null
  created_at: string
}

/**
 * List continuity families for a franchise.
 *
 * @param franchiseSlug - Franchise slug filter
 */
export async function listContinuityFamilies(franchiseSlug: string): Promise<ContinuityFamilyRow[]> {
  const { rows } = await pool.query<ContinuityFamilyRow>(
    `SELECT cf.id, cf.slug, cf.name, cf.sort_order, cf.notes, cf.created_at
       FROM continuity_families cf
       JOIN franchises fr ON fr.id = cf.franchise_id
      WHERE fr.slug = $1
      ORDER BY cf.sort_order ASC NULLS LAST, cf.name ASC`,
    [franchiseSlug],
  )
  return rows
}

/**
 * Fetch a single continuity family by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param cfSlug - Continuity family slug to look up
 */
export async function getContinuityFamilyBySlug(
  franchiseSlug: string,
  cfSlug: string,
): Promise<ContinuityFamilyRow | null> {
  const { rows } = await pool.query<ContinuityFamilyRow>(
    `SELECT cf.id, cf.slug, cf.name, cf.sort_order, cf.notes, cf.created_at
       FROM continuity_families cf
       JOIN franchises fr ON fr.id = cf.franchise_id
      WHERE fr.slug = $1 AND cf.slug = $2`,
    [franchiseSlug, cfSlug],
  )
  return rows[0] ?? null
}
