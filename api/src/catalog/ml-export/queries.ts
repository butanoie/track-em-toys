import { pool } from '../../db/pool.js';
import { buildSearchTsquery } from '../search/queries.js';
import { buildItemsQuery, type ItemFilters } from '../items/queries.js';

export interface ExportItemPhotoRow {
  item_id: string;
  item_slug: string;
  item_name: string;
  franchise_slug: string;
  photo_id: string | null;
}

const SELECT_COLUMNS = `
    SELECT i.id AS item_id,
           i.slug AS item_slug,
           i.name AS item_name,
           fr.slug AS franchise_slug,
           ip.id AS photo_id`;

// IMPORTANT: Do NOT add `AND ip.visibility = 'public'` to this JOIN.
// The ML training pipeline must include BOTH visibility tiers:
//   - 'public' (catalog_and_training intent): visible in the catalog + trains
//   - 'training_only' intent: hidden from the catalog but still trains
// Adding a visibility filter here would silently exclude training_only
// contributions from the training set, defeating the whole point of offering
// the training_only intent to contributors. See migration 037 and issue #148.
// This constant is `export`ed so a regression test can assert the absence of
// the visibility filter (see queries.test.ts).
export const PHOTO_JOIN = `
      LEFT JOIN item_photos ip ON ip.item_id = i.id AND ip.status = 'approved'`;

const ORDER_BY = `
     ORDER BY fr.slug ASC, i.slug ASC, ip.sort_order ASC`;

/**
 * Find all items matching a search query and their approved photos.
 * Returns one row per photo per item. Items with zero approved photos
 * produce one row with photo_id = null (for warning generation).
 *
 * @param query - Full-text search query string
 * @param franchiseSlug - Optional franchise filter
 */
export async function getExportableItemsBySearch(
  query: string,
  franchiseSlug: string | null
): Promise<ExportItemPhotoRow[]> {
  const tsqueryStr = buildSearchTsquery(query);
  if (!tsqueryStr) return [];

  const sql = `${SELECT_COLUMNS}
      FROM items i
      JOIN franchises fr ON fr.id = i.franchise_id
      LEFT JOIN item_character_depictions icd ON icd.item_id = i.id AND icd.is_primary = true
      LEFT JOIN character_appearances ca ON ca.id = icd.appearance_id
      LEFT JOIN characters ch ON ch.id = ca.character_id${PHOTO_JOIN}
     WHERE (i.search_vector @@ to_tsquery('simple', $1)
            OR ch.search_vector @@ to_tsquery('simple', $1))
       AND ($2::text IS NULL OR fr.slug = $2)${ORDER_BY}`;

  const { rows } = await pool.query<ExportItemPhotoRow>(sql, [tsqueryStr, franchiseSlug]);
  return rows;
}

/**
 * Find all items matching catalog filters and their approved photos.
 * Uses the same filter logic as the items browse endpoint.
 *
 * @param franchiseSlug - Franchise slug (required for filter-based export)
 * @param filters - Optional item filters (manufacturer, toy_line, etc.)
 */
export async function getExportableItemsByFilters(
  franchiseSlug: string,
  filters?: ItemFilters
): Promise<ExportItemPhotoRow[]> {
  const { joins, whereClause, params } = buildItemsQuery(franchiseSlug, filters);

  const sql = `${SELECT_COLUMNS}${joins}${PHOTO_JOIN}
     WHERE ${whereClause}${ORDER_BY}`;

  const { rows } = await pool.query<ExportItemPhotoRow>(sql, params);
  return rows;
}
