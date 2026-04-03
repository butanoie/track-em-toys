import { pool } from '../db/pool.js';
import type { QueryOnlyClient } from '../db/queries.js';
import type { UserRole } from '../types/index.js';

/** Row shape for admin user list and detail responses. */
export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  deactivated_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

const ADMIN_USER_COLUMNS = 'id, email, display_name, avatar_url, role, deactivated_at, deleted_at, created_at';

/**
 * Escape ILIKE special characters in a search string.
 * Order matters: escape backslash first, then % and _.
 *
 * @param input - Raw search string to escape
 */
function escapeIlike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * List users with optional role and email filters.
 * Uses pool.query() directly — no transaction needed for read-only admin queries.
 * No RLS on users table; this is intentional (admin has full visibility).
 *
 * @param params - Filter, pagination, and sort options
 */
export async function listAdminUsers(params: {
  role?: UserRole;
  email?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AdminUserRow[]; totalCount: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.role) {
    conditions.push(`role = $${paramIdx}`);
    values.push(params.role);
    paramIdx++;
  }

  if (params.email) {
    conditions.push(`LOWER(email) LIKE LOWER($${paramIdx})`);
    values.push(`%${escapeIlike(params.email)}%`);
    paramIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countQuery = `SELECT COUNT(*)::int AS count FROM users ${where}`;
  const dataQuery = `SELECT ${ADMIN_USER_COLUMNS} FROM users ${where} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

  const [countResult, dataResult] = await Promise.all([
    pool.query<{ count: number }>(countQuery, values),
    pool.query<AdminUserRow>(dataQuery, [...values, params.limit, params.offset]),
  ]);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.count ?? 0,
  };
}

/**
 * Find a single user by ID for admin operations.
 * Uses FOR UPDATE to serialize concurrent mutations on the same user —
 * critical for last-admin protection (two concurrent demotions must not
 * both read count=2, pass the guard, and both commit).
 *
 * @param client - Database client with transaction
 * @param userId - Target user UUID
 */
export async function findUserForAdmin(client: QueryOnlyClient, userId: string): Promise<AdminUserRow | null> {
  const { rows } = await client.query<AdminUserRow>(
    `SELECT ${ADMIN_USER_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Update a user's role. Checks rowCount to ensure the update was applied.
 *
 * @param client - Database client with transaction
 * @param userId - Target user UUID
 * @param role - New role to assign
 */
export async function updateUserRole(
  client: QueryOnlyClient,
  userId: string,
  role: UserRole
): Promise<AdminUserRow | null> {
  const { rows } = await client.query<AdminUserRow>(
    `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING ${ADMIN_USER_COLUMNS}`,
    [userId, role]
  );
  return rows[0] ?? null;
}

/**
 * Reactivate a deactivated user by clearing deactivated_at.
 *
 * @param client - Database client with transaction
 * @param userId - Target user UUID
 */
export async function reactivateUser(client: QueryOnlyClient, userId: string): Promise<AdminUserRow | null> {
  const { rows } = await client.query<AdminUserRow>(
    `UPDATE users SET deactivated_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING ${ADMIN_USER_COLUMNS}`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * GDPR-compliant user purge: scrub PII, set tombstone flags, hard-delete auth data,
 * and scrub PII from audit events. All statements run in a single transaction.
 *
 * ON DELETE CASCADE on oauth_accounts and refresh_tokens does NOT fire because the
 * users row is preserved as a tombstone — explicit DELETEs are required.
 *
 * @param client - Database client with transaction
 * @param userId - Target user UUID
 */
export async function gdprPurgeUser(client: QueryOnlyClient, userId: string): Promise<void> {
  // 1. Scrub PII and set tombstone flags on the users row
  await client.query(
    `UPDATE users SET
       email = NULL,
       display_name = NULL,
       avatar_url = NULL,
       deactivated_at = COALESCE(deactivated_at, NOW()),
       deleted_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );

  // 2. Hard-delete auth data (separate from PII scrub)
  await client.query('DELETE FROM oauth_accounts WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

  // 3. Scrub PII from audit events (ip_address and user_agent are personal data under GDPR)
  await client.query(
    'UPDATE auth_events SET ip_address = NULL, user_agent = NULL, metadata = NULL WHERE user_id = $1',
    [userId]
  );

  // 4. Delete collection photos and items (both tables have FORCE RLS).
  //    Switch RLS context to the target user so DELETE can see their rows.
  //    Subsequent operations touch non-RLS tables, so the context switch is safe.
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);

  // 4a. Delete collection item photos first (FK child of collection_items).
  //     ON DELETE SET NULL on photo_contributions.collection_item_photo_id
  //     preserves contribution audit records with a NULL source reference.
  await client.query('DELETE FROM collection_item_photos WHERE user_id = $1', [userId]);

  // 4b. Delete collection items (FK parent, now safe after photo deletion)
  await client.query('DELETE FROM collection_items WHERE user_id = $1', [userId]);

  // 5. Scrub attribution on contributed catalog photos (item_photos has no RLS)
  await client.query(
    'UPDATE item_photos SET uploaded_by = NULL, updated_at = NOW() WHERE uploaded_by = $1',
    [userId]
  );
}

/**
 * Count the number of active (non-deactivated, non-deleted) admins.
 * Used for last-admin protection before demotion.
 *
 * @param client - Database client with transaction
 */
export async function countActiveAdmins(client: QueryOnlyClient): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND deactivated_at IS NULL AND deleted_at IS NULL"
  );
  return rows[0]?.count ?? 0;
}
