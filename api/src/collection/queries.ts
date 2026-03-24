import type { PoolClient } from '../db/pool.js';
import type { ItemCondition } from '../types/index.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/**
 * Row returned by the collection list query.
 * `name` and `id` are aliased for buildCursorPage<T extends { name: string; id: string }>.
 */
export interface CollectionListRow {
  id: string; // ci.id — collection entry UUID (cursor id)
  name: string; // i.name — item name (cursor name)
  item_id: string;
  item_name: string;
  item_slug: string;
  franchise_slug: string;
  franchise_name: string;
  manufacturer_slug: string | null;
  manufacturer_name: string | null;
  toy_line_slug: string;
  toy_line_name: string;
  thumbnail_url: string | null;
  condition: ItemCondition;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FranchiseStat {
  slug: string;
  name: string;
  count: number;
}

export interface ConditionStat {
  condition: ItemCondition;
  count: number;
}

export interface CollectionStats {
  total_copies: number;
  unique_items: number;
  deleted_count: number;
  by_franchise: FranchiseStat[];
  by_condition: ConditionStat[];
}

export interface CheckRow {
  item_id: string;
  count: number;
  collection_ids: string[];
}

// ---------------------------------------------------------------------------
// Shared SELECT for full joined collection item
// ---------------------------------------------------------------------------

/**
 * Base SELECT + FROM/JOIN clause used by list, get, and post-write fetches.
 * Callers append their own WHERE, ORDER BY, and LIMIT.
 */
const COLLECTION_ITEM_SELECT = `
    SELECT
        ci.id,
        i.name,
        i.id         AS item_id,
        i.name       AS item_name,
        i.slug       AS item_slug,
        fr.slug      AS franchise_slug,
        fr.name      AS franchise_name,
        mfr.slug     AS manufacturer_slug,
        mfr.name     AS manufacturer_name,
        tl.slug      AS toy_line_slug,
        tl.name      AS toy_line_name,
        ip.url       AS thumbnail_url,
        ci.condition,
        ci.notes,
        ci.deleted_at,
        ci.created_at,
        ci.updated_at
    FROM collection_items ci
    JOIN items i              ON i.id   = ci.item_id
    JOIN franchises fr        ON fr.id  = i.franchise_id
    LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
    JOIN toy_lines tl         ON tl.id  = i.toy_line_id
    LEFT JOIN item_photos ip
        ON ip.item_id    = i.id
       AND ip.is_primary = true
       AND ip.status     = 'approved'`;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListCollectionParams {
  franchise: string | null;
  condition: string | null;
  search: string | null;
  cursor: { name: string; id: string } | null;
  limit: number;
}

/**
 * List the authenticated user's active collection items with optional filters.
 * RLS enforces user isolation — only the current user's rows are visible.
 *
 * @param client - Transaction client with RLS context
 * @param params - Pagination, filter, and cursor parameters
 */
export async function listCollectionItems(
  client: PoolClient,
  params: ListCollectionParams
): Promise<{ rows: CollectionListRow[]; totalCount: number }> {
  const { franchise, condition, search, cursor, limit } = params;

  const dataQuery = `
    ${COLLECTION_ITEM_SELECT}
    WHERE ci.deleted_at IS NULL
      AND ($1::text IS NULL OR fr.slug = $1)
      AND ($2::text IS NULL OR ci.condition = $2::item_condition)
      AND ($3::text IS NULL OR i.search_vector @@ websearch_to_tsquery('simple', $3))
      AND ($4::text IS NULL OR (i.name, ci.id) > ($4, $5::uuid))
    ORDER BY i.name ASC, ci.id ASC
    LIMIT $6`;

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
    FROM collection_items ci
    JOIN items i ON i.id = ci.item_id
    JOIN franchises fr ON fr.id = i.franchise_id
    WHERE ci.deleted_at IS NULL
      AND ($1::text IS NULL OR fr.slug = $1)
      AND ($2::text IS NULL OR ci.condition = $2::item_condition)
      AND ($3::text IS NULL OR i.search_vector @@ websearch_to_tsquery('simple', $3))`;

  const filterParams = [franchise, condition, search];
  const dataParams = [...filterParams, cursor?.name ?? null, cursor?.id ?? null, limit + 1];

  const dataResult = await client.query<CollectionListRow>(dataQuery, dataParams);
  const countResult = await client.query<{ total_count: number }>(countQuery, filterParams);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Get by ID
// ---------------------------------------------------------------------------

/**
 * Fetch a single collection item by its UUID.
 * Returns the row regardless of deleted_at — callers decide whether to 404.
 *
 * @param client - Transaction client with RLS context
 * @param id - Collection item UUID
 */
export async function getCollectionItemById(client: PoolClient, id: string): Promise<CollectionListRow | null> {
  const query = `${COLLECTION_ITEM_SELECT} WHERE ci.id = $1`;
  const { rows } = await client.query<CollectionListRow>(query, [id]);
  return rows[0] ?? null;
}

/**
 * Fetch a single collection item by ID with FOR UPDATE lock.
 * Used by PATCH and DELETE to serialize concurrent mutations.
 * Returns { id, deleted_at } for state checking before mutation.
 *
 * @param client - Transaction client with RLS context
 * @param id - Collection item UUID
 */
export async function lockCollectionItem(
  client: PoolClient,
  id: string
): Promise<{ id: string; deleted_at: string | null } | null> {
  const { rows } = await client.query<{ id: string; deleted_at: string | null }>(
    `SELECT id, deleted_at FROM collection_items WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

/**
 * Check that a catalog item exists. Items table has no RLS — this SELECT
 * works regardless of the app.user_id RLS context.
 *
 * @param client - Transaction client with RLS context
 * @param itemId - Catalog item UUID
 */
export async function itemExists(client: PoolClient, itemId: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM items WHERE id = $1::uuid) AS exists`,
    [itemId]
  );
  return rows[0]?.exists ?? false;
}

/**
 * Insert a new collection item and return the generated ID.
 *
 * @param client - Transaction client with RLS context
 * @param userId - Authenticated user's UUID
 * @param itemId - Catalog item UUID
 * @param condition - Physical condition of the copy
 * @param notes - Sanitized notes or null
 */
export async function insertCollectionItem(
  client: PoolClient,
  userId: string,
  itemId: string,
  condition: ItemCondition,
  notes: string | null
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO collection_items (user_id, item_id, condition, notes)
     VALUES ($1::uuid, $2::uuid, $3::item_condition, $4)
     RETURNING id`,
    [userId, itemId, condition, notes]
  );
  return rows[0]!.id;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface StatsRaw {
  total_copies: number;
  unique_items: number;
  deleted_count: number;
  by_franchise: FranchiseStat[] | null;
  by_condition: ConditionStat[] | null;
}

/**
 * Get collection summary statistics. Uses a single CTE for snapshot consistency
 * at READ COMMITTED isolation level.
 *
 * @param client - Transaction client with RLS context
 */
export async function getCollectionStats(client: PoolClient): Promise<CollectionStats> {
  const { rows } = await client.query<StatsRaw>(`
    WITH active AS (
      SELECT ci.item_id, ci.condition, i.franchise_id
      FROM collection_items ci
      JOIN items i ON i.id = ci.item_id
      WHERE ci.deleted_at IS NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM active) AS total_copies,
      (SELECT COUNT(DISTINCT item_id)::int FROM active) AS unique_items,
      (SELECT COUNT(*)::int FROM collection_items WHERE deleted_at IS NOT NULL) AS deleted_count,
      COALESCE(
        (SELECT json_agg(row_to_json(f))
         FROM (
           SELECT fr.slug, fr.name, COUNT(*)::int AS count
           FROM active a
           JOIN franchises fr ON fr.id = a.franchise_id
           GROUP BY fr.slug, fr.name
           ORDER BY count DESC, fr.name ASC
         ) f),
        '[]'::json
      ) AS by_franchise,
      COALESCE(
        (SELECT json_agg(row_to_json(c))
         FROM (
           SELECT condition::text AS condition, COUNT(*)::int AS count
           FROM active
           GROUP BY condition
           ORDER BY count DESC
         ) c),
        '[]'::json
      ) AS by_condition
  `);

  const raw = rows[0];
  return {
    total_copies: raw?.total_copies ?? 0,
    unique_items: raw?.unique_items ?? 0,
    deleted_count: raw?.deleted_count ?? 0,
    by_franchise: raw?.by_franchise ?? [],
    by_condition: raw?.by_condition ?? [],
  };
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

/**
 * Batch-check which item IDs are in the user's active collection.
 *
 * @param client - Transaction client with RLS context
 * @param itemIds - Array of catalog item UUIDs
 */
export async function checkCollectionItems(client: PoolClient, itemIds: string[]): Promise<CheckRow[]> {
  const { rows } = await client.query<CheckRow>(
    `SELECT
       item_id::text,
       COUNT(*)::int AS count,
       array_agg(id::text ORDER BY created_at ASC) AS collection_ids
     FROM collection_items
     WHERE item_id = ANY($1::uuid[])
       AND deleted_at IS NULL
     GROUP BY item_id`,
    [itemIds]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Update condition and/or notes on a collection item.
 * Uses dynamic SET to handle partial updates.
 *
 * @param client - Transaction client with RLS context
 * @param id - Collection item UUID
 * @param fields - Fields to update
 */
export async function updateCollectionItem(
  client: PoolClient,
  id: string,
  fields: { condition?: ItemCondition; notes?: string | null; notesProvided: boolean }
): Promise<boolean> {
  const setClauses: string[] = [];
  const params: unknown[] = [id]; // $1 is always the id
  let idx = 2;

  if (fields.condition !== undefined) {
    setClauses.push(`condition = $${idx}::item_condition`);
    params.push(fields.condition);
    idx++;
  }

  if (fields.notesProvided) {
    setClauses.push(`notes = $${idx}`);
    params.push(fields.notes ?? null);
  }

  if (setClauses.length === 0) return false;

  const result = await client.query(
    `UPDATE collection_items SET ${setClauses.join(', ')} WHERE id = $1 AND deleted_at IS NULL`,
    params
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Soft delete
// ---------------------------------------------------------------------------

/**
 * Soft-delete a collection item by setting deleted_at.
 *
 * @param client - Transaction client with RLS context
 * @param id - Collection item UUID
 */
export async function softDeleteCollectionItem(client: PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE collection_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Soft-delete all active collection items for the current RLS user.
 * Used by the overwrite import mode to clear the collection before re-importing.
 *
 * @param client - Transaction client with RLS context
 */
export async function softDeleteAllCollectionItems(client: PoolClient): Promise<number> {
  const result = await client.query(`UPDATE collection_items SET deleted_at = now() WHERE deleted_at IS NULL`);
  return result.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore a soft-deleted collection item by clearing deleted_at.
 * Unconditional UPDATE — idempotent for already-active items.
 *
 * @param client - Transaction client with RLS context
 * @param id - Collection item UUID
 */
export async function restoreCollectionItem(client: PoolClient, id: string): Promise<boolean> {
  const result = await client.query(`UPDATE collection_items SET deleted_at = NULL WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportRow {
  franchise_slug: string;
  item_slug: string;
  condition: ItemCondition;
  notes: string | null;
  added_at: string;
  deleted_at: string | null;
}

/**
 * Fetch all collection items for the current RLS user in slug-based export format.
 * No UUIDs in the output — only slugs and enum values for cross-purge portability.
 *
 * @param client - Transaction client with RLS context
 * @param includeDeleted - When true, includes soft-deleted items
 */
export async function exportCollectionItems(client: PoolClient, includeDeleted: boolean): Promise<ExportRow[]> {
  const whereClause = includeDeleted ? '' : 'WHERE ci.deleted_at IS NULL';
  const { rows } = await client.query<ExportRow>(
    `SELECT
        fr.slug      AS franchise_slug,
        i.slug       AS item_slug,
        ci.condition,
        ci.notes,
        ci.created_at AS added_at,
        ci.deleted_at
     FROM collection_items ci
     JOIN items i        ON i.id  = ci.item_id
     JOIN franchises fr  ON fr.id = i.franchise_id
     ${whereClause}
     ORDER BY fr.slug ASC, i.name ASC, ci.created_at ASC`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ResolvedSlug {
  item_id: string;
  item_name: string;
}

/**
 * Batch-resolve (franchise_slug, item_slug) pairs to item UUIDs and names.
 * Items have no RLS — this query is safe inside an RLS-set transaction.
 * Returns a Map keyed by "franchise_slug::item_slug".
 *
 * @param client - Transaction client with RLS context
 * @param slugPairs - Array of slug pairs to resolve
 */
export async function batchGetItemIdsBySlugs(
  client: PoolClient,
  slugPairs: Array<{ franchise_slug: string; item_slug: string }>
): Promise<Map<string, ResolvedSlug>> {
  if (slugPairs.length === 0) return new Map();

  const franchiseSlugs = slugPairs.map((p) => p.franchise_slug);
  const itemSlugs = slugPairs.map((p) => p.item_slug);

  const { rows } = await client.query<{
    franchise_slug: string;
    item_slug: string;
    item_id: string;
    item_name: string;
  }>(
    `SELECT
        fr.slug AS franchise_slug,
        i.slug  AS item_slug,
        i.id    AS item_id,
        i.name  AS item_name
     FROM UNNEST($1::text[], $2::text[]) AS input(franchise_slug, item_slug)
     JOIN franchises fr ON fr.slug = input.franchise_slug
     JOIN items i       ON i.franchise_id = fr.id AND i.slug = input.item_slug`,
    [franchiseSlugs, itemSlugs]
  );

  const result = new Map<string, ResolvedSlug>();
  for (const row of rows) {
    result.set(`${row.franchise_slug}::${row.item_slug}`, {
      item_id: row.item_id,
      item_name: row.item_name,
    });
  }
  return result;
}
