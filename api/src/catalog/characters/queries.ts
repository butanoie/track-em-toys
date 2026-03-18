import { pool } from '../../db/pool.js'

// ---------------------------------------------------------------------------
// List query row type (flat JOIN result)
// ---------------------------------------------------------------------------

export interface CharacterListRow {
  id: string
  name: string
  slug: string
  franchise_slug: string
  franchise_name: string
  faction_slug: string | null
  faction_name: string | null
  continuity_family_slug: string
  continuity_family_name: string
  character_type: string | null
  alt_mode: string | null
  is_combined_form: boolean
}

// ---------------------------------------------------------------------------
// Detail query row types
// ---------------------------------------------------------------------------

export interface CharacterBaseRow extends CharacterListRow {
  combiner_role: string | null
  combined_form_id: string | null
  combined_form_slug: string | null
  combined_form_name: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SubGroupRef {
  slug: string
  name: string
}

export interface AppearanceRow {
  id: string
  slug: string
  name: string
  source_media: string | null
  source_name: string | null
  year_start: number | null
  year_end: number | null
  description: string | null
}

// ---------------------------------------------------------------------------
// List Characters (cursor-paginated)
// ---------------------------------------------------------------------------

export interface ListCharactersParams {
  franchiseSlug: string
  limit: number
  cursor: { name: string; id: string } | null
}

export async function listCharacters(
  params: ListCharactersParams,
): Promise<{ rows: CharacterListRow[]; totalCount: number }> {
  const { franchiseSlug, limit, cursor } = params

  const dataQuery = `
    SELECT c.id, c.name, c.slug,
           c.character_type, c.alt_mode, c.is_combined_form,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           fa.slug AS faction_slug, fa.name AS faction_name,
           cf.slug AS continuity_family_slug, cf.name AS continuity_family_name
      FROM characters c
      JOIN franchises fr ON fr.id = c.franchise_id
      LEFT JOIN factions fa ON fa.id = c.faction_id
      JOIN continuity_families cf ON cf.id = c.continuity_family_id
     WHERE fr.slug = $1
       AND ($2::text IS NULL OR (c.name, c.id) > ($2, $3::uuid))
     ORDER BY c.name ASC, c.id ASC
     LIMIT $4`

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
      FROM characters c
      JOIN franchises fr ON fr.id = c.franchise_id
      LEFT JOIN factions fa ON fa.id = c.faction_id
      JOIN continuity_families cf ON cf.id = c.continuity_family_id
     WHERE fr.slug = $1`

  const [dataResult, countResult] = await Promise.all([
    pool.query<CharacterListRow>(dataQuery, [
      franchiseSlug,
      cursor?.name ?? null,
      cursor?.id ?? null,
      limit + 1,
    ]),
    pool.query<{ total_count: number }>(countQuery, [franchiseSlug]),
  ])

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Get Character Detail
// ---------------------------------------------------------------------------

export interface CharacterDetail {
  base: CharacterBaseRow
  subGroups: SubGroupRef[]
  appearances: AppearanceRow[]
}

export async function getCharacterBySlug(
  franchiseSlug: string,
  characterSlug: string,
): Promise<CharacterDetail | null> {
  const baseQuery = `
    SELECT c.id, c.name, c.slug,
           c.character_type, c.alt_mode,
           c.is_combined_form, c.combiner_role,
           c.combined_form_id,
           c.metadata, c.created_at, c.updated_at,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           fa.slug AS faction_slug, fa.name AS faction_name,
           cf.slug AS continuity_family_slug, cf.name AS continuity_family_name,
           cform.slug AS combined_form_slug, cform.name AS combined_form_name
      FROM characters c
      JOIN franchises fr ON fr.id = c.franchise_id
      LEFT JOIN factions fa ON fa.id = c.faction_id
      JOIN continuity_families cf ON cf.id = c.continuity_family_id
      LEFT JOIN characters cform ON cform.id = c.combined_form_id
     WHERE fr.slug = $1 AND c.slug = $2`

  const { rows: baseRows } = await pool.query<CharacterBaseRow>(baseQuery, [
    franchiseSlug,
    characterSlug,
  ])
  const base = baseRows[0]
  if (!base) return null

  const [subGroupResult, appearanceResult] = await Promise.all([
    pool.query<SubGroupRef>(
      `SELECT sg.slug, sg.name
         FROM character_sub_groups csg
         JOIN sub_groups sg ON sg.id = csg.sub_group_id
        WHERE csg.character_id = $1
        ORDER BY sg.name ASC`,
      [base.id],
    ),
    pool.query<AppearanceRow>(
      `SELECT id, slug, name, source_media, source_name,
              year_start, year_end, description
         FROM character_appearances
        WHERE character_id = $1
        ORDER BY year_start ASC NULLS LAST, name ASC`,
      [base.id],
    ),
  ])

  return {
    base,
    subGroups: subGroupResult.rows,
    appearances: appearanceResult.rows,
  }
}
