import { pool } from '../../db/pool.js'

// ---------------------------------------------------------------------------
// List query row type
// ---------------------------------------------------------------------------

export interface ItemListRow {
  id: string
  name: string
  slug: string
  franchise_slug: string
  franchise_name: string
  character_slug: string
  character_name: string
  manufacturer_slug: string | null
  manufacturer_name: string | null
  toy_line_slug: string
  toy_line_name: string
  size_class: string | null
  year_released: number | null
  is_third_party: boolean
  data_quality: string
}

// ---------------------------------------------------------------------------
// Detail query row type
// ---------------------------------------------------------------------------

export interface ItemBaseRow extends ItemListRow {
  appearance_slug: string | null
  appearance_name: string | null
  appearance_source_media: string | null
  appearance_source_name: string | null
  description: string | null
  barcode: string | null
  sku: string | null
  product_code: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PhotoRow {
  id: string
  url: string
  caption: string | null
  is_primary: boolean
}

// ---------------------------------------------------------------------------
// List Items (cursor-paginated)
// ---------------------------------------------------------------------------

export interface ListItemsParams {
  franchiseSlug: string
  limit: number
  cursor: { name: string; id: string } | null
}

/**
 * List items for a franchise with cursor pagination.
 *
 * @param params - Cursor-paginated list parameters
 */
export async function listItems(
  params: ListItemsParams,
): Promise<{ rows: ItemListRow[]; totalCount: number }> {
  const { franchiseSlug, limit, cursor } = params

  const dataQuery = `
    SELECT i.id, i.name, i.slug,
           i.size_class, i.year_released, i.is_third_party, i.data_quality,
           fr.slug AS franchise_slug, fr.name AS franchise_name,
           ch.slug AS character_slug, ch.name AS character_name,
           mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name,
           tl.slug AS toy_line_slug, tl.name AS toy_line_name
      FROM items i
      JOIN franchises fr ON fr.id = i.franchise_id
      JOIN characters ch ON ch.id = i.character_id
      LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
      JOIN toy_lines tl ON tl.id = i.toy_line_id
     WHERE fr.slug = $1
       AND ($2::text IS NULL OR (i.name, i.id) > ($2, $3::uuid))
     ORDER BY i.name ASC, i.id ASC
     LIMIT $4`

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
      FROM items i
      JOIN franchises fr ON fr.id = i.franchise_id
      JOIN characters ch ON ch.id = i.character_id
      LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
      JOIN toy_lines tl ON tl.id = i.toy_line_id
     WHERE fr.slug = $1`

  const [dataResult, countResult] = await Promise.all([
    pool.query<ItemListRow>(dataQuery, [
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
// Get Item Detail
// ---------------------------------------------------------------------------

export interface ItemDetail {
  base: ItemBaseRow
  photos: PhotoRow[]
}

/**
 * Fetch a single item by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param itemSlug - Item slug to look up
 */
export async function getItemBySlug(
  franchiseSlug: string,
  itemSlug: string,
): Promise<ItemDetail | null> {
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
     WHERE fr.slug = $1 AND i.slug = $2`

  const { rows: baseRows } = await pool.query<ItemBaseRow>(baseQuery, [
    franchiseSlug,
    itemSlug,
  ])
  const base = baseRows[0]
  if (!base) return null

  const { rows: photos } = await pool.query<PhotoRow>(
    `SELECT id, url, caption, is_primary
       FROM item_photos
      WHERE item_id = $1
      ORDER BY is_primary DESC, created_at ASC`,
    [base.id],
  )

  return { base, photos }
}
