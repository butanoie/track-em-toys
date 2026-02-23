import pg from 'pg'
import pino from 'pino'
import { config } from '../config.js'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

export const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error')
})

export type PoolClient = pg.PoolClient

/**
 * Execute a function within a database transaction, with automatic
 * COMMIT on success and ROLLBACK on error.
 *
 * When `userId` is provided, sets the PostgreSQL session variable `app.user_id`
 * as the first statement inside the transaction so that Row Level Security
 * policies can reference `current_setting('app.user_id')` on the same connection.
 *
 * @param fn - Async function receiving a dedicated pool client
 * @param userId - Optional authenticated user ID for RLS context
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  userId?: string | null,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (userId) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId])
    }
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
