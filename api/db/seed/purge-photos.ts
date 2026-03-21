/**
 * Purge all item photos from the database.
 *
 * Usage:
 *   npx tsx db/seed/purge-photos.ts --confirm
 *
 * This truncates the item_photos table (CASCADE covers any dependent FKs).
 * It does NOT delete files from PHOTO_STORAGE_PATH — remove those manually.
 */

import 'dotenv/config'
import pg from 'pg'
import pino from 'pino'

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' })

const dbUrl = process.env['DATABASE_URL']
if (!dbUrl) {
  log.fatal('DATABASE_URL environment variable is required')
  process.exit(1)
}

const ssl = process.env['DATABASE_SSL_CA']
  ? { rejectUnauthorized: true }
  : undefined

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isConfirmed = args.includes('--confirm')

  if (!isConfirmed) {
    log.fatal('--confirm flag required. This will DELETE all item_photos rows.')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 1, ssl })
  const client = await pool.connect()

  try {
    const before = await client.query('SELECT COUNT(*)::int AS count FROM item_photos')
    const rowCount = before.rows[0].count as number
    log.info({ rowCount }, 'item_photos rows before purge')

    if (rowCount === 0) {
      log.info('nothing to purge')
      return
    }

    await client.query('TRUNCATE item_photos CASCADE')
    log.info({ deleted: rowCount }, 'item_photos purged')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  log.fatal({ err }, 'purge-photos failed')
  process.exit(1)
})
