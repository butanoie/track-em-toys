import tls from 'node:tls';
import pg from 'pg';
import pino from 'pino';
import { config } from '../config.js';

const logger = pino({ level: config.logLevel });

/**
 * Build the SSL configuration for the pg.Pool.
 *
 * - production / staging with DATABASE_SSL_CA set: use the provided PEM as the
 *   CA so that the managed DB's certificate chain is verified against a known
 *   root rather than the system store.
 * - production / staging without DATABASE_SSL_CA: trust the system CAs with
 *   full chain verification.  Modern managed providers (Neon, Supabase, RDS)
 *   use publicly-trusted root CAs, so this works without a custom CA.
 * - development / test: SSL is not required; return undefined to allow plain
 *   TCP connections to a local Postgres instance.
 */
function buildSslConfig(): tls.ConnectionOptions | undefined {
  if (!['production', 'staging'].includes(config.nodeEnv)) return undefined;
  return config.database.sslCa ? { rejectUnauthorized: true, ca: config.database.sslCa } : { rejectUnauthorized: true };
}

/**
 * Shared PostgreSQL connection pool for the application.
 * All database access should go through this pool or {@link withTransaction}.
 */
export const pool = new pg.Pool({
  connectionString: config.database.url,
  max: config.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: buildSslConfig(),
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

export type PoolClient = pg.PoolClient;

/**
 * Execute a function within a database transaction, with automatic
 * COMMIT on success and ROLLBACK on error.
 *
 * When `userId` is provided, sets the PostgreSQL session variable `app.user_id`
 * as the first statement inside the transaction so that Row Level Security
 * policies can reference `current_setting('app.user_id')` on the same connection.
 *
 * When `userId` is null/omitted, the session variable is explicitly reset to ''
 * so that stale values from a reused connection are never visible.
 *
 * @param fn - Async function receiving a dedicated pool client
 * @param userId - Optional authenticated user ID for RLS context
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, userId?: string | null): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Always set app.user_id at the start of every transaction so that
    // stale values from a reused connection are never visible to RLS policies.
    // When userId is null/omitted this resets to '' (empty string); when provided
    // it sets the RLS context for the authenticated user — one round-trip either way.
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ rollbackErr }, 'ROLLBACK failed');
    }
    throw err;
  } finally {
    client.release();
  }
}
