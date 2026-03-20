import { pool, withTransaction } from '../../db/pool.js';

export interface PhotoWriteRow {
  id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
  status: string;
}

export interface InsertPhotoParams {
  id: string;
  itemId: string;
  url: string;
  uploadedBy: string;
  sortOrder: number;
}

const PHOTO_COLUMNS = 'id, url, caption, is_primary, sort_order, status';
const APPROVED_ORDER = `is_primary DESC, sort_order ASC, created_at ASC`;

/**
 * Insert a photo row. The sort_order is provided by the caller (computed
 * from MAX(sort_order) + offset for batch inserts).
 */
export async function insertPhoto(params: InsertPhotoParams): Promise<PhotoWriteRow> {
  const { rows } = await pool.query<PhotoWriteRow>(
    `INSERT INTO item_photos (id, item_id, url, uploaded_by, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PHOTO_COLUMNS}`,
    [params.id, params.itemId, params.url, params.uploadedBy, params.sortOrder]
  );
  return rows[0]!;
}

/**
 * Get the current maximum sort_order for an item's photos.
 * Intentionally unfiltered by status — sort_order must be globally unique
 * per item to avoid collisions when pending photos become approved.
 */
export async function getMaxSortOrder(itemId: string): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM item_photos WHERE item_id = $1`,
    [itemId]
  );
  return rows[0]?.max ?? 0;
}

export async function deletePhoto(photoId: string, itemId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM item_photos WHERE id = $1 AND item_id = $2`, [photoId, itemId]);
  return (rowCount ?? 0) > 0;
}

/** Atomically clear the existing primary photo and set a new one. */
export async function setPhotoAsPrimary(photoId: string, itemId: string): Promise<PhotoWriteRow | null> {
  return withTransaction(async (client) => {
    await client.query(`UPDATE item_photos SET is_primary = false WHERE item_id = $1 AND is_primary = true`, [itemId]);
    const { rows } = await client.query<PhotoWriteRow>(
      `UPDATE item_photos SET is_primary = true, updated_at = now()
       WHERE id = $1 AND item_id = $2
       RETURNING ${PHOTO_COLUMNS}`,
      [photoId, itemId]
    );
    return rows[0] ?? null;
  });
}

/** Bulk-update sort_order for photos of an item, returning the reordered approved list. */
export async function reorderPhotos(
  itemId: string,
  order: Array<{ id: string; sort_order: number }>
): Promise<PhotoWriteRow[]> {
  return withTransaction(async (client) => {
    if (order.length > 0) {
      const values = order.map((o, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`).join(', ');
      const params = order.flatMap((o) => [o.id, o.sort_order]);

      await client.query(
        `UPDATE item_photos SET sort_order = v.sort_order, updated_at = now()
         FROM (VALUES ${values}) AS v(id, sort_order)
         WHERE item_photos.id = v.id AND item_photos.item_id = $${params.length + 1}`,
        [...params, itemId]
      );
    }

    const { rows } = await client.query<PhotoWriteRow>(
      `SELECT ${PHOTO_COLUMNS} FROM item_photos
       WHERE item_id = $1 AND status = 'approved'
       ORDER BY ${APPROVED_ORDER}`,
      [itemId]
    );
    return rows;
  });
}

/** Fetch all approved photos for an item, ordered for display. */
export async function listPhotos(itemId: string): Promise<PhotoWriteRow[]> {
  const { rows } = await pool.query<PhotoWriteRow>(
    `SELECT ${PHOTO_COLUMNS} FROM item_photos
     WHERE item_id = $1 AND status = 'approved'
     ORDER BY ${APPROVED_ORDER}`,
    [itemId]
  );
  return rows;
}
