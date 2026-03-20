import { pool } from '../../db/pool.js';

// ---------------------------------------------------------------------------
// List query row type (flat JOIN result)
// ---------------------------------------------------------------------------

export interface CharacterListRow {
  id: string;
  name: string;
  slug: string;
  franchise_slug: string;
  franchise_name: string;
  faction_slug: string | null;
  faction_name: string | null;
  continuity_family_slug: string;
  continuity_family_name: string;
  character_type: string | null;
  alt_mode: string | null;
  is_combined_form: boolean;
}

// ---------------------------------------------------------------------------
// Detail query row types
// ---------------------------------------------------------------------------

export interface CharacterBaseRow extends CharacterListRow {
  combiner_role: string | null;
  combined_form_id: string | null;
  combined_form_slug: string | null;
  combined_form_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SubGroupRef {
  slug: string;
  name: string;
}

export interface AppearanceRow {
  id: string;
  slug: string;
  name: string;
  source_media: string | null;
  source_name: string | null;
  year_start: number | null;
  year_end: number | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Character filters
// ---------------------------------------------------------------------------

export interface CharacterFilters {
  continuity_family?: string;
  faction?: string;
  character_type?: string;
  sub_group?: string;
}

// ---------------------------------------------------------------------------
// Shared query builder
// ---------------------------------------------------------------------------

/**
 * Build shared FROM/JOIN/WHERE clause for character queries.
 * Both data and count queries call this to ensure identical conditions.
 * The sub_group filter uses an EXISTS subquery to avoid Cartesian products
 * from the many-to-many character_sub_groups junction table.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param filters - Optional character filters
 */
function buildCharactersQuery(
  franchiseSlug: string,
  filters?: CharacterFilters
): { joins: string; whereClause: string; params: unknown[] } {
  const clauses: string[] = ['fr.slug = $1'];
  const params: unknown[] = [franchiseSlug];
  let idx = 2;

  if (filters?.continuity_family !== undefined) {
    clauses.push(`cf.slug = $${idx}`);
    params.push(filters.continuity_family);
    idx++;
  }
  if (filters?.faction !== undefined) {
    clauses.push(`fa.slug = $${idx}`);
    params.push(filters.faction);
    idx++;
  }
  if (filters?.character_type !== undefined) {
    clauses.push(`c.character_type = $${idx}`);
    params.push(filters.character_type);
    idx++;
  }
  if (filters?.sub_group !== undefined) {
    clauses.push(
      `EXISTS (
        SELECT 1
          FROM character_sub_groups csg
          JOIN sub_groups sg ON sg.id = csg.sub_group_id
         WHERE csg.character_id = c.id
           AND sg.slug = $${idx}
      )`
    );
    params.push(filters.sub_group);
  }

  const joins = `
      FROM characters c
      JOIN franchises fr ON fr.id = c.franchise_id
      LEFT JOIN factions fa ON fa.id = c.faction_id
      JOIN continuity_families cf ON cf.id = c.continuity_family_id`;

  return { joins, whereClause: clauses.join(' AND '), params };
}

// ---------------------------------------------------------------------------
// List Characters (cursor-paginated, with optional filters)
// ---------------------------------------------------------------------------

export interface ListCharactersParams {
  franchiseSlug: string;
  limit: number;
  cursor: { name: string; id: string } | null;
  filters?: CharacterFilters;
}

/**
 * List characters for a franchise with cursor pagination and optional filters.
 *
 * @param params - Cursor-paginated list parameters with filters
 */
export async function listCharacters(
  params: ListCharactersParams
): Promise<{ rows: CharacterListRow[]; totalCount: number }> {
  const { franchiseSlug, limit, cursor, filters } = params;
  const { joins, whereClause, params: filterParams } = buildCharactersQuery(franchiseSlug, filters);

  const cursorIdx = filterParams.length + 1;
  const limitIdx = filterParams.length + 3;

  const dataQuery = `
    SELECT c.id, c.name, c.slug,
           c.character_type, c.alt_mode, c.is_combined_form,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           fa.slug AS faction_slug, fa.name AS faction_name,
           cf.slug AS continuity_family_slug, cf.name AS continuity_family_name
    ${joins}
     WHERE ${whereClause}
       AND ($${cursorIdx}::text IS NULL OR (c.name, c.id) > ($${cursorIdx}, $${cursorIdx + 1}::uuid))
     ORDER BY c.name ASC, c.id ASC
     LIMIT $${limitIdx}`;

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
    ${joins}
     WHERE ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    pool.query<CharacterListRow>(dataQuery, [...filterParams, cursor?.name ?? null, cursor?.id ?? null, limit + 1]),
    pool.query<{ total_count: number }>(countQuery, filterParams),
  ]);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Facet counts (cross-filtered)
// ---------------------------------------------------------------------------

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface CharacterFacets {
  factions: FacetValue[];
  character_types: FacetValue[];
  sub_groups: FacetValue[];
}

/**
 * Get facet counts for characters in a franchise, with cross-filtering.
 *
 * Each facet dimension excludes its own filter from the WHERE clause so
 * users see all available options with counts reflecting other active filters.
 * The sub_group facet JOINs the junction table directly (COUNT(DISTINCT c.id)
 * ensures correct counts despite many-to-many row multiplication).
 *
 * @param franchiseSlug - Franchise slug
 * @param filters - Currently active filters
 */
export async function getCharacterFacets(franchiseSlug: string, filters?: CharacterFilters): Promise<CharacterFacets> {
  function filtersExcluding(key: keyof CharacterFilters): CharacterFilters {
    if (!filters) return {};
    const copy = { ...filters };
    delete copy[key];
    return copy;
  }

  const [factionResult, characterTypeResult, subGroupResult] = await Promise.all([
    (() => {
      const { joins, whereClause, params } = buildCharactersQuery(franchiseSlug, filtersExcluding('faction'));
      return pool.query<FacetValue>(
        `SELECT fa.slug AS value, fa.name AS label, COUNT(*)::int AS count
         ${joins}
          WHERE ${whereClause} AND fa.id IS NOT NULL
          GROUP BY fa.slug, fa.name
          ORDER BY count DESC, fa.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildCharactersQuery(franchiseSlug, filtersExcluding('character_type'));
      return pool.query<FacetValue>(
        `SELECT c.character_type AS value, c.character_type AS label, COUNT(*)::int AS count
         ${joins}
          WHERE ${whereClause} AND c.character_type IS NOT NULL
          GROUP BY c.character_type
          ORDER BY count DESC, c.character_type ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildCharactersQuery(franchiseSlug, filtersExcluding('sub_group'));
      return pool.query<FacetValue>(
        `SELECT sg.slug AS value, sg.name AS label, COUNT(DISTINCT c.id)::int AS count
         ${joins}
          JOIN character_sub_groups csg ON csg.character_id = c.id
          JOIN sub_groups sg ON sg.id = csg.sub_group_id
          WHERE ${whereClause}
          GROUP BY sg.slug, sg.name
          ORDER BY count DESC, sg.name ASC`,
        params
      );
    })(),
  ]);

  return {
    factions: factionResult.rows,
    character_types: characterTypeResult.rows,
    sub_groups: subGroupResult.rows,
  };
}

// ---------------------------------------------------------------------------
// Get Character Detail
// ---------------------------------------------------------------------------

export interface ComponentCharacterRef {
  slug: string;
  name: string;
  combiner_role: string | null;
  alt_mode: string | null;
}

export interface CharacterDetail {
  base: CharacterBaseRow;
  subGroups: SubGroupRef[];
  appearances: AppearanceRow[];
  componentCharacters: ComponentCharacterRef[];
}

/**
 * Fetch a single character by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param characterSlug - Character slug to look up
 */
export async function getCharacterBySlug(
  franchiseSlug: string,
  characterSlug: string
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
     WHERE fr.slug = $1 AND c.slug = $2`;

  const { rows: baseRows } = await pool.query<CharacterBaseRow>(baseQuery, [franchiseSlug, characterSlug]);
  const base = baseRows[0];
  if (!base) return null;

  const [subGroupResult, appearanceResult, componentResult] = await Promise.all([
    pool.query<SubGroupRef>(
      `SELECT sg.slug, sg.name
         FROM character_sub_groups csg
         JOIN sub_groups sg ON sg.id = csg.sub_group_id
        WHERE csg.character_id = $1
        ORDER BY sg.name ASC`,
      [base.id]
    ),
    pool.query<AppearanceRow>(
      `SELECT id, slug, name, source_media, source_name,
              year_start, year_end, description
         FROM character_appearances
        WHERE character_id = $1
        ORDER BY year_start ASC NULLS LAST, name ASC`,
      [base.id]
    ),
    base.is_combined_form
      ? pool.query<ComponentCharacterRef>(
          `SELECT slug, name, combiner_role, alt_mode
             FROM characters
            WHERE combined_form_id = $1
            ORDER BY name ASC`,
          [base.id]
        )
      : Promise.resolve({ rows: [] as ComponentCharacterRef[] }),
  ]);

  return {
    base,
    subGroups: subGroupResult.rows,
    appearances: appearanceResult.rows,
    componentCharacters: componentResult.rows,
  };
}
