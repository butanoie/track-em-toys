import { pool } from '../../db/pool.js';
import type { ItemListRow, FacetValue } from '../items/queries.js';

export interface ManufacturerRow {
  id: string;
  name: string;
  slug: string;
  is_official_licensee: boolean;
  country: string | null;
  website_url: string | null;
  aliases: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List all manufacturers ordered by name.
 */
export async function listManufacturers(): Promise<ManufacturerRow[]> {
  const { rows } = await pool.query<ManufacturerRow>(
    `SELECT id, name, slug, is_official_licensee, country, website_url,
            aliases, notes, created_at, updated_at
       FROM manufacturers
      ORDER BY name ASC`
  );
  return rows;
}

/**
 * Fetch a single manufacturer by slug.
 *
 * @param slug - Manufacturer slug to look up
 */
export async function getManufacturerBySlug(slug: string): Promise<ManufacturerRow | null> {
  const { rows } = await pool.query<ManufacturerRow>(
    `SELECT id, name, slug, is_official_licensee, country, website_url,
            aliases, notes, created_at, updated_at
       FROM manufacturers
      WHERE slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Stats (aggregate counts per manufacturer)
// ---------------------------------------------------------------------------

export interface ManufacturerStatsRow {
  slug: string;
  name: string;
  is_official_licensee: boolean;
  country: string | null;
  item_count: number;
  toy_line_count: number;
  franchise_count: number;
}

/**
 * List all manufacturers with aggregate item/toy_line/franchise counts.
 *
 * Uses subquery JOINs to avoid Cartesian product between items and toy_lines.
 */
export async function listManufacturerStats(): Promise<ManufacturerStatsRow[]> {
  const { rows } = await pool.query<ManufacturerStatsRow>(
    `SELECT m.slug, m.name, m.is_official_licensee, m.country,
            COALESCE(ic.item_count, 0)::int AS item_count,
            COALESCE(ic.franchise_count, 0)::int AS franchise_count,
            COALESCE(tlc.toy_line_count, 0)::int AS toy_line_count
       FROM manufacturers m
       LEFT JOIN (
         SELECT manufacturer_id,
                COUNT(*)::int AS item_count,
                COUNT(DISTINCT franchise_id)::int AS franchise_count
           FROM items
          GROUP BY manufacturer_id
       ) ic ON ic.manufacturer_id = m.id
       LEFT JOIN (
         SELECT manufacturer_id, COUNT(*)::int AS toy_line_count
           FROM toy_lines
          GROUP BY manufacturer_id
       ) tlc ON tlc.manufacturer_id = m.id
      ORDER BY m.name ASC`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Manufacturer-scoped item filters
// ---------------------------------------------------------------------------

export interface ManufacturerItemFilters {
  franchise?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
}

/**
 * Build shared FROM/JOIN/WHERE clause for manufacturer-scoped item queries.
 * Both data and count queries call this to ensure identical conditions.
 *
 * @param manufacturerSlug - Manufacturer slug scope
 * @param filters - Optional item filters
 */
function buildManufacturerItemsQuery(
  manufacturerSlug: string,
  filters?: ManufacturerItemFilters
): { joins: string; whereClause: string; params: unknown[] } {
  const clauses: string[] = ['mfr.slug = $1'];
  const params: unknown[] = [manufacturerSlug];
  let idx = 2;

  if (filters?.franchise !== undefined) {
    clauses.push(`fr.slug = $${idx}`);
    params.push(filters.franchise);
    idx++;
  }
  if (filters?.size_class !== undefined) {
    clauses.push(`i.size_class = $${idx}`);
    params.push(filters.size_class);
    idx++;
  }
  if (filters?.toy_line !== undefined) {
    clauses.push(`tl.slug = $${idx}`);
    params.push(filters.toy_line);
    idx++;
  }
  if (filters?.continuity_family !== undefined) {
    clauses.push(
      `EXISTS (SELECT 1 FROM item_character_depictions icd JOIN character_appearances ca ON ca.id = icd.appearance_id JOIN characters ch ON ch.id = ca.character_id JOIN continuity_families cf ON cf.id = ch.continuity_family_id WHERE icd.item_id = i.id AND cf.slug = $${idx})`
    );
    params.push(filters.continuity_family);
    idx++;
  }
  if (filters?.is_third_party !== undefined) {
    clauses.push(`i.is_third_party = $${idx}`);
    params.push(filters.is_third_party);
  }

  const joins = `
      FROM items i
      INNER JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
      INNER JOIN franchises fr ON fr.id = i.franchise_id
      JOIN toy_lines tl ON tl.id = i.toy_line_id`;

  return { joins, whereClause: clauses.join(' AND '), params };
}

// ---------------------------------------------------------------------------
// List manufacturer-scoped items (cursor-paginated)
// ---------------------------------------------------------------------------

export interface ListManufacturerItemsParams {
  manufacturerSlug: string;
  limit: number;
  cursor: { name: string; id: string } | null;
  filters?: ManufacturerItemFilters;
}

/**
 * List items for a manufacturer with cursor pagination and optional filters.
 *
 * @param params - Cursor-paginated list parameters with filters
 */
export async function listManufacturerItems(
  params: ListManufacturerItemsParams
): Promise<{ rows: ItemListRow[]; totalCount: number }> {
  const { manufacturerSlug, limit, cursor, filters } = params;
  const { joins, whereClause, params: filterParams } = buildManufacturerItemsQuery(manufacturerSlug, filters);

  const cursorIdx = filterParams.length + 1;
  const limitIdx = filterParams.length + 3;

  const dataQuery = `
    SELECT i.id, i.name, i.slug,
           i.size_class, i.year_released, i.is_third_party, i.data_quality,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name,
           tl.slug AS toy_line_slug, tl.name AS toy_line_name,
           COALESCE(
             (SELECT json_agg(
               json_build_object(
                 'slug', ch.slug,
                 'name', ch.name,
                 'appearance_slug', ca.slug,
                 'is_primary', icd.is_primary
               ) ORDER BY icd.is_primary DESC, ch.name ASC
             )
             FROM item_character_depictions icd
             JOIN character_appearances ca ON ca.id = icd.appearance_id
             JOIN characters ch ON ch.id = ca.character_id
             WHERE icd.item_id = i.id),
             '[]'::json
           ) AS characters
    ${joins}
     WHERE ${whereClause}
       AND ($${cursorIdx}::text IS NULL OR (i.name, i.id) > ($${cursorIdx}, $${cursorIdx + 1}::uuid))
     ORDER BY i.name ASC, i.id ASC
     LIMIT $${limitIdx}`;

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
    ${joins}
     WHERE ${whereClause}`;

  const [dataResult, countResult] = await Promise.all([
    pool.query<ItemListRow>(dataQuery, [...filterParams, cursor?.name ?? null, cursor?.id ?? null, limit + 1]),
    pool.query<{ total_count: number }>(countQuery, filterParams),
  ]);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Manufacturer-scoped facet counts (cross-filtered)
// ---------------------------------------------------------------------------

export interface ManufacturerItemFacets {
  franchises: FacetValue[];
  size_classes: FacetValue[];
  toy_lines: FacetValue[];
  continuity_families: FacetValue[];
  is_third_party: FacetValue[];
}

/**
 * Get facet counts for items scoped to a manufacturer, with cross-filtering.
 *
 * @param manufacturerSlug - Manufacturer slug
 * @param filters - Currently active filters
 */
export async function getManufacturerItemFacets(
  manufacturerSlug: string,
  filters?: ManufacturerItemFilters
): Promise<ManufacturerItemFacets> {
  function filtersExcluding(key: keyof ManufacturerItemFilters): ManufacturerItemFilters {
    if (!filters) return {};
    const copy = { ...filters };
    delete copy[key];
    return copy;
  }

  const [franchiseResult, sizeResult, toyLineResult, cfResult, thirdPartyResult] = await Promise.all([
    (() => {
      const { joins, whereClause, params } = buildManufacturerItemsQuery(
        manufacturerSlug,
        filtersExcluding('franchise')
      );
      return pool.query<FacetValue>(
        `SELECT fr.slug AS value, fr.name AS label, COUNT(*)::int AS count
         ${joins}
         WHERE ${whereClause}
         GROUP BY fr.slug, fr.name
         ORDER BY count DESC, fr.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildManufacturerItemsQuery(
        manufacturerSlug,
        filtersExcluding('size_class')
      );
      return pool.query<FacetValue>(
        `SELECT i.size_class AS value, i.size_class AS label, COUNT(*)::int AS count
         ${joins}
         WHERE ${whereClause} AND i.size_class IS NOT NULL
         GROUP BY i.size_class
         ORDER BY count DESC, i.size_class ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildManufacturerItemsQuery(
        manufacturerSlug,
        filtersExcluding('toy_line')
      );
      return pool.query<FacetValue>(
        `SELECT tl.slug AS value, tl.name AS label, COUNT(*)::int AS count
         ${joins}
         WHERE ${whereClause}
         GROUP BY tl.slug, tl.name
         ORDER BY count DESC, tl.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildManufacturerItemsQuery(
        manufacturerSlug,
        filtersExcluding('continuity_family')
      );
      return pool.query<FacetValue>(
        `SELECT cf.slug AS value, cf.name AS label, COUNT(DISTINCT i.id)::int AS count
         ${joins}
         JOIN item_character_depictions icd ON icd.item_id = i.id
         JOIN character_appearances ca ON ca.id = icd.appearance_id
         JOIN characters ch ON ch.id = ca.character_id
         JOIN continuity_families cf ON cf.id = ch.continuity_family_id
         WHERE ${whereClause}
         GROUP BY cf.slug, cf.name
         ORDER BY count DESC, cf.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildManufacturerItemsQuery(
        manufacturerSlug,
        filtersExcluding('is_third_party')
      );
      return pool.query<FacetValue>(
        `SELECT CASE WHEN i.is_third_party THEN 'true' ELSE 'false' END AS value,
                CASE WHEN i.is_third_party THEN 'Third Party' ELSE 'Official' END AS label,
                COUNT(*)::int AS count
         ${joins}
         WHERE ${whereClause}
         GROUP BY i.is_third_party
         ORDER BY i.is_third_party ASC`,
        params
      );
    })(),
  ]);

  return {
    franchises: franchiseResult.rows,
    size_classes: sizeResult.rows,
    toy_lines: toyLineResult.rows,
    continuity_families: cfResult.rows,
    is_third_party: thirdPartyResult.rows,
  };
}
