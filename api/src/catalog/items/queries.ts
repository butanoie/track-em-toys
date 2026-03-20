import { pool } from '../../db/pool.js';

// ---------------------------------------------------------------------------
// List query row type
// ---------------------------------------------------------------------------

export interface ItemListRow {
  id: string;
  name: string;
  slug: string;
  franchise_slug: string;
  franchise_name: string;
  character_slug: string;
  character_name: string;
  manufacturer_slug: string | null;
  manufacturer_name: string | null;
  toy_line_slug: string;
  toy_line_name: string;
  size_class: string | null;
  year_released: number | null;
  is_third_party: boolean;
  data_quality: string;
}

// ---------------------------------------------------------------------------
// Detail query row type
// ---------------------------------------------------------------------------

export interface ItemBaseRow extends ItemListRow {
  appearance_slug: string | null;
  appearance_name: string | null;
  appearance_source_media: string | null;
  appearance_source_name: string | null;
  description: string | null;
  barcode: string | null;
  sku: string | null;
  product_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Item filters
// ---------------------------------------------------------------------------

export interface ItemFilters {
  manufacturer?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
  character?: string;
}

// ---------------------------------------------------------------------------
// List Items (cursor-paginated, with optional filters)
// ---------------------------------------------------------------------------

export interface ListItemsParams {
  franchiseSlug: string;
  limit: number;
  cursor: { name: string; id: string } | null;
  filters?: ItemFilters;
}

/**
 * Build shared FROM/JOIN/WHERE clause for items queries.
 * Both data and count queries call this to ensure identical conditions.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param filters - Optional item filters
 */
function buildItemsQuery(
  franchiseSlug: string,
  filters?: ItemFilters
): { joins: string; whereClause: string; params: unknown[] } {
  const clauses: string[] = ['fr.slug = $1'];
  const params: unknown[] = [franchiseSlug];
  let idx = 2;

  // Continuity family filter requires JOIN through characters → continuity_families.
  // Always include the JOIN since characters is already INNER JOINed.
  const needsCfJoin = filters?.continuity_family !== undefined;

  if (filters?.manufacturer !== undefined) {
    clauses.push(`mfr.slug = $${idx}`);
    params.push(filters.manufacturer);
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
    clauses.push(`cf.slug = $${idx}`);
    params.push(filters.continuity_family);
    idx++;
  }
  if (filters?.is_third_party !== undefined) {
    clauses.push(`i.is_third_party = $${idx}`);
    params.push(filters.is_third_party);
    idx++;
  }
  if (filters?.character !== undefined) {
    clauses.push(`ch.slug = $${idx}`);
    params.push(filters.character);
  }

  const joins = `
      FROM items i
      JOIN franchises fr ON fr.id = i.franchise_id
      JOIN characters ch ON ch.id = i.character_id
      LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
      JOIN toy_lines tl ON tl.id = i.toy_line_id${needsCfJoin ? '\n      JOIN continuity_families cf ON cf.id = ch.continuity_family_id' : ''}`;

  return { joins, whereClause: clauses.join(' AND '), params };
}

/**
 * List items for a franchise with cursor pagination and optional filters.
 *
 * @param params - Cursor-paginated list parameters with filters
 */
export async function listItems(params: ListItemsParams): Promise<{ rows: ItemListRow[]; totalCount: number }> {
  const { franchiseSlug, limit, cursor, filters } = params;
  const { joins, whereClause, params: filterParams } = buildItemsQuery(franchiseSlug, filters);

  const cursorIdx = filterParams.length + 1;
  const limitIdx = filterParams.length + 3;

  const dataQuery = `
    SELECT i.id, i.name, i.slug,
           i.size_class, i.year_released, i.is_third_party, i.data_quality,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           ch.slug AS character_slug, ch.name AS character_name,
           mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name,
           tl.slug AS toy_line_slug, tl.name AS toy_line_name
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
// Facet counts (cross-filtered)
// ---------------------------------------------------------------------------

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface ItemFacets {
  manufacturers: FacetValue[];
  size_classes: FacetValue[];
  toy_lines: FacetValue[];
  continuity_families: FacetValue[];
  is_third_party: FacetValue[];
}

/**
 * Get facet counts for items in a franchise, with cross-filtering.
 *
 * Each facet dimension excludes its own filter from the WHERE clause so
 * users see all available options with counts reflecting other active filters.
 *
 * @param franchiseSlug - Franchise slug
 * @param filters - Currently active filters
 */
export async function getItemFacets(franchiseSlug: string, filters?: ItemFilters): Promise<ItemFacets> {
  function filtersExcluding(key: keyof ItemFilters): ItemFilters {
    if (!filters) return {};
    const copy = { ...filters };
    delete copy[key];
    return copy;
  }

  const [mfrResult, sizeResult, toyLineResult, cfResult, thirdPartyResult] = await Promise.all([
    (() => {
      const { joins, whereClause, params } = buildItemsQuery(franchiseSlug, filtersExcluding('manufacturer'));
      return pool.query<FacetValue>(
        `SELECT mfr.slug AS value, mfr.name AS label, COUNT(*)::int AS count
         ${joins}
         WHERE ${whereClause} AND mfr.id IS NOT NULL
         GROUP BY mfr.slug, mfr.name
         ORDER BY count DESC, mfr.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildItemsQuery(franchiseSlug, filtersExcluding('size_class'));
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
      const { joins, whereClause, params } = buildItemsQuery(franchiseSlug, filtersExcluding('toy_line'));
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
      const {
        joins: baseJoins,
        whereClause,
        params,
      } = buildItemsQuery(franchiseSlug, filtersExcluding('continuity_family'));
      const cfJoin = baseJoins.includes('continuity_families')
        ? baseJoins
        : `${baseJoins}\n      JOIN continuity_families cf ON cf.id = ch.continuity_family_id`;
      return pool.query<FacetValue>(
        `SELECT cf.slug AS value, cf.name AS label, COUNT(*)::int AS count
         ${cfJoin}
         WHERE ${whereClause}
         GROUP BY cf.slug, cf.name
         ORDER BY count DESC, cf.name ASC`,
        params
      );
    })(),

    (() => {
      const { joins, whereClause, params } = buildItemsQuery(franchiseSlug, filtersExcluding('is_third_party'));
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
    manufacturers: mfrResult.rows,
    size_classes: sizeResult.rows,
    toy_lines: toyLineResult.rows,
    continuity_families: cfResult.rows,
    is_third_party: thirdPartyResult.rows,
  };
}

// ---------------------------------------------------------------------------
// Get Item Detail
// ---------------------------------------------------------------------------

export interface ItemDetail {
  base: ItemBaseRow;
  photos: PhotoRow[];
}

/**
 * Fetch a single item by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param itemSlug - Item slug to look up
 */
export async function getItemBySlug(franchiseSlug: string, itemSlug: string): Promise<ItemDetail | null> {
  const baseQuery = `
    SELECT i.id, i.name, i.slug,
           i.size_class, i.year_released, i.is_third_party, i.data_quality,
           i.description, i.barcode, i.sku, i.product_code,
           i.metadata, i.created_at, i.updated_at,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           ch.slug AS character_slug, ch.name AS character_name,
           mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name,
           tl.slug AS toy_line_slug, tl.name AS toy_line_name,
           ca.slug AS appearance_slug, ca.name AS appearance_name,
           ca.source_media AS appearance_source_media,
           ca.source_name AS appearance_source_name
      FROM items i
      JOIN franchises fr ON fr.id = i.franchise_id
      JOIN characters ch ON ch.id = i.character_id
      LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
      JOIN toy_lines tl ON tl.id = i.toy_line_id
      LEFT JOIN character_appearances ca ON ca.id = i.character_appearance_id
     WHERE fr.slug = $1 AND i.slug = $2`;

  const { rows: baseRows } = await pool.query<ItemBaseRow>(baseQuery, [franchiseSlug, itemSlug]);
  const base = baseRows[0];
  if (!base) return null;

  const { rows: photos } = await pool.query<PhotoRow>(
    `SELECT id, url, caption, is_primary, sort_order
       FROM item_photos
      WHERE item_id = $1 AND status = 'approved'
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    [base.id]
  );

  return { base, photos };
}

// ---------------------------------------------------------------------------
// Lightweight item ID lookup (used by photo routes)
// ---------------------------------------------------------------------------

/**
 * Resolve an item's UUID from franchise + item slugs.
 *
 * @param franchiseSlug - Franchise slug
 * @param itemSlug - Item slug within the franchise
 */
export async function getItemIdBySlug(franchiseSlug: string, itemSlug: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT i.id
       FROM items i
       JOIN franchises fr ON fr.id = i.franchise_id
      WHERE fr.slug = $1 AND i.slug = $2`,
    [franchiseSlug, itemSlug]
  );
  return rows[0]?.id ?? null;
}
