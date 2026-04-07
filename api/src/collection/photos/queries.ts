import type { PoolClient } from '../../db/pool.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface CollectionPhotoRow {
  id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
}

/** Extended row with contribution status, returned only by listCollectionPhotos. */
export interface CollectionPhotoListRow extends CollectionPhotoRow {
  contribution_status: string | null;
}

export interface InsertCollectionPhotoParams {
  id: string;
  collectionItemId: string;
  userId: string;
  url: string;
  sortOrder: number;
  dhash: string;
}

export interface PhotoHashRow {
  id: string;
  url: string;
  dhash: string;
}

export interface ContributionRow {
  id: string;
  collection_item_photo_id: string | null;
  item_photo_id: string | null;
  status: string;
}

const PHOTO_COLUMNS = 'id, url, caption, is_primary, sort_order';
const DISPLAY_ORDER = 'is_primary DESC, sort_order ASC, created_at ASC';

// ---------------------------------------------------------------------------
// Collection item lookup (shared by all photo route handlers)
// ---------------------------------------------------------------------------

export interface CollectionItemRef {
  id: string;
  item_id: string;
}

/**
 * Verify a collection item exists and is active. RLS enforces ownership.
 * Returns the collection item ID and its linked catalog item ID.
 *
 * @param client - Transaction client with RLS context
 * @param collectionItemId - Collection item UUID
 */
export async function getCollectionItemRef(
  client: PoolClient,
  collectionItemId: string
): Promise<CollectionItemRef | null> {
  const { rows } = await client.query<CollectionItemRef>(
    'SELECT id, item_id FROM collection_items WHERE id = $1 AND deleted_at IS NULL',
    [collectionItemId]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Catalog photo insert (for contribute handler)
// ---------------------------------------------------------------------------

/**
 * Insert a pending catalog photo from a user contribution.
 * Computes sort_order from the existing max for the catalog item.
 * `item_photos` has no RLS — this works regardless of the app.user_id context.
 *
 * @param client - Transaction client
 * @param params - Catalog photo insert parameters
 */
export async function insertPendingCatalogPhoto(
  client: PoolClient,
  params: {
    id: string;
    itemId: string;
    url: string;
    uploadedBy: string;
    dhash: string;
    visibility: 'public' | 'training_only';
  }
): Promise<void> {
  await client.query(
    `INSERT INTO item_photos (id, item_id, url, uploaded_by, sort_order, dhash, status, visibility)
     VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM item_photos WHERE item_id = $2), $5, 'pending', $6)`,
    [params.id, params.itemId, params.url, params.uploadedBy, params.dhash, params.visibility]
  );
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a collection item photo.
 *
 * @param client - Transaction client with RLS context
 * @param params - Photo insert parameters
 */
export async function insertCollectionPhoto(
  client: PoolClient,
  params: InsertCollectionPhotoParams
): Promise<CollectionPhotoRow> {
  const { rows } = await client.query<CollectionPhotoRow>(
    `INSERT INTO collection_item_photos (id, collection_item_id, user_id, url, sort_order, dhash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PHOTO_COLUMNS}`,
    [params.id, params.collectionItemId, params.userId, params.url, params.sortOrder, params.dhash]
  );
  return rows[0]!;
}

/**
 * List photos for a collection item, ordered for display.
 *
 * @param client - Transaction client with RLS context
 * @param collectionItemId - Collection item UUID
 */
export async function listCollectionPhotos(
  client: PoolClient,
  collectionItemId: string
): Promise<CollectionPhotoListRow[]> {
  const { rows } = await client.query<CollectionPhotoListRow>(
    `SELECT cip.id, cip.url, cip.caption, cip.is_primary, cip.sort_order,
            pc.status AS contribution_status
     FROM collection_item_photos cip
     LEFT JOIN photo_contributions pc
       ON pc.collection_item_photo_id = cip.id AND pc.status != 'revoked'
     WHERE cip.collection_item_id = $1
     ORDER BY cip.is_primary DESC, cip.sort_order ASC, cip.created_at ASC`,
    [collectionItemId]
  );
  return rows;
}

/**
 * Fetch dHash values for all photos of a collection item.
 * Used by the upload handler to check for perceptual duplicates.
 *
 * @param client - Transaction client with RLS context
 * @param collectionItemId - Collection item UUID
 */
export async function getPhotoHashesByCollectionItem(
  client: PoolClient,
  collectionItemId: string
): Promise<PhotoHashRow[]> {
  const { rows } = await client.query<PhotoHashRow>(
    `SELECT id, url, dhash FROM collection_item_photos
     WHERE collection_item_id = $1 AND dhash != ''`,
    [collectionItemId]
  );
  return rows;
}

/**
 * Get the current maximum sort_order for a collection item's photos.
 *
 * @param client - Transaction client with RLS context
 * @param collectionItemId - Collection item UUID
 */
export async function getMaxSortOrder(client: PoolClient, collectionItemId: string): Promise<number> {
  const { rows } = await client.query<{ max: number | null }>(
    'SELECT MAX(sort_order) AS max FROM collection_item_photos WHERE collection_item_id = $1',
    [collectionItemId]
  );
  return rows[0]?.max ?? 0;
}

/**
 * Delete a collection photo by ID and collection item ID.
 *
 * @param client - Transaction client with RLS context
 * @param photoId - Photo UUID
 * @param collectionItemId - Collection item UUID
 */
export async function deleteCollectionPhoto(
  client: PoolClient,
  photoId: string,
  collectionItemId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    'DELETE FROM collection_item_photos WHERE id = $1 AND collection_item_id = $2',
    [photoId, collectionItemId]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Atomically clear the existing primary photo and set a new one.
 *
 * @param client - Transaction client with RLS context (already in a transaction)
 * @param photoId - Photo UUID to promote
 * @param collectionItemId - Collection item UUID
 */
export async function setCollectionPhotoPrimary(
  client: PoolClient,
  photoId: string,
  collectionItemId: string
): Promise<CollectionPhotoRow | null> {
  await client.query(
    'UPDATE collection_item_photos SET is_primary = false WHERE collection_item_id = $1 AND is_primary = true',
    [collectionItemId]
  );
  const { rows } = await client.query<CollectionPhotoRow>(
    `UPDATE collection_item_photos SET is_primary = true, updated_at = now()
     WHERE id = $1 AND collection_item_id = $2
     RETURNING ${PHOTO_COLUMNS}`,
    [photoId, collectionItemId]
  );
  return rows[0] ?? null;
}

/**
 * Bulk-update sort_order for photos of a collection item, returning the reordered list.
 *
 * @param client - Transaction client with RLS context (already in a transaction)
 * @param collectionItemId - Collection item UUID
 * @param order - Array of photo ID + new sort_order pairs
 */
export async function reorderCollectionPhotos(
  client: PoolClient,
  collectionItemId: string,
  order: Array<{ id: string; sort_order: number }>
): Promise<CollectionPhotoRow[]> {
  if (order.length > 0) {
    const values = order.map((o, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`).join(', ');
    const params = order.flatMap((o) => [o.id, o.sort_order]);

    await client.query(
      `UPDATE collection_item_photos SET sort_order = v.sort_order, updated_at = now()
       FROM (VALUES ${values}) AS v(id, sort_order)
       WHERE collection_item_photos.id = v.id AND collection_item_photos.collection_item_id = $${params.length + 1}`,
      [...params, collectionItemId]
    );
  }

  const { rows } = await client.query<CollectionPhotoRow>(
    `SELECT ${PHOTO_COLUMNS} FROM collection_item_photos
     WHERE collection_item_id = $1
     ORDER BY ${DISPLAY_ORDER}`,
    [collectionItemId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Contribution
// ---------------------------------------------------------------------------

/**
 * Get a photo by ID (for the contribute handler to verify it exists and fetch its dhash).
 *
 * @param client - Transaction client with RLS context
 * @param photoId - Photo UUID
 * @param collectionItemId - Collection item UUID
 */
export async function getCollectionPhotoById(
  client: PoolClient,
  photoId: string,
  collectionItemId: string
): Promise<{ id: string; url: string; dhash: string; collection_item_id: string } | null> {
  const { rows } = await client.query<{ id: string; url: string; dhash: string; collection_item_id: string }>(
    `SELECT id, url, dhash, collection_item_id FROM collection_item_photos
     WHERE id = $1 AND collection_item_id = $2`,
    [photoId, collectionItemId]
  );
  return rows[0] ?? null;
}

/**
 * Check if an active (non-revoked) contribution exists for a collection photo.
 *
 * @param client - Transaction client (no RLS on photo_contributions)
 * @param collectionItemPhotoId - Collection item photo UUID
 */
export async function getActiveContribution(
  client: PoolClient,
  collectionItemPhotoId: string
): Promise<ContributionRow | null> {
  const { rows } = await client.query<ContributionRow>(
    `SELECT id, collection_item_photo_id, item_photo_id, status FROM photo_contributions
     WHERE collection_item_photo_id = $1 AND status != 'revoked'`,
    [collectionItemPhotoId]
  );
  return rows[0] ?? null;
}

/**
 * Insert a photo contribution record.
 *
 * @param client - Transaction client
 * @param params - Contribution parameters
 */
export async function insertContribution(
  client: PoolClient,
  params: {
    collectionItemPhotoId: string;
    contributedBy: string;
    itemId: string;
    consentVersion: string;
    intent: 'training_only' | 'catalog_and_training';
  }
): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO photo_contributions (collection_item_photo_id, contributed_by, item_id, consent_version, intent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.collectionItemPhotoId, params.contributedBy, params.itemId, params.consentVersion, params.intent]
  );
  return rows[0]!;
}

/**
 * Update a contribution with the catalog photo ID and mark file as copied.
 *
 * @param client - Transaction client
 * @param contributionId - Contribution UUID
 * @param itemPhotoId - Catalog item_photos UUID
 */
export async function updateContributionCopied(
  client: PoolClient,
  contributionId: string,
  itemPhotoId: string
): Promise<void> {
  await client.query(
    `UPDATE photo_contributions SET item_photo_id = $1, file_copied = true, updated_at = now()
     WHERE id = $2`,
    [itemPhotoId, contributionId]
  );
}

/**
 * Revoke a contribution by setting status to 'revoked'.
 *
 * @param client - Transaction client
 * @param photoId - Collection item photo UUID
 * @param contributedBy - User UUID (for ownership verification)
 */
export async function revokeContribution(client: PoolClient, photoId: string, contributedBy: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE photo_contributions SET status = 'revoked', updated_at = now()
     WHERE collection_item_photo_id = $1 AND contributed_by = $2 AND status != 'revoked'`,
    [photoId, contributedBy]
  );
  return (rowCount ?? 0) > 0;
}
