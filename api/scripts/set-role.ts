/**
 * CLI script: Set a user's role in the database.
 *
 * Usage: npm run set-role -- <email> <role>
 *
 * Example: npm run set-role -- owner@example.com admin
 */
import 'dotenv/config'
import pg from 'pg'

const VALID_ROLES = ['user', 'curator', 'admin'] as const

const email = process.argv[2]
const role = process.argv[3]

if (!email || !role) {
  console.error('Usage: npm run set-role -- <email> <role>')
  console.error('Valid roles: user, curator, admin')
  process.exit(1)
}

if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
  console.error(`Invalid role: "${role}". Valid roles: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
})

try {
  const { rows } = await pool.query<{ id: string; email: string; role: string; deactivated_at: string | null; deleted_at: string | null }>(
    'UPDATE users SET role = $2, updated_at = NOW() WHERE LOWER(email) = LOWER($1) RETURNING id, email, role, deactivated_at, deleted_at',
    [email, role],
  )

  if (rows.length === 0) {
    console.error(`User not found: ${email}`)
    process.exit(1)
  }

  const user = rows[0]!
  console.log(`Updated user ${user.email} (${user.id}) → role: ${user.role}`)

  if (user.deleted_at) {
    console.warn('Warning: this user has been GDPR-purged (tombstone). Role was updated on tombstone row.')
  } else if (user.deactivated_at) {
    console.warn('Note: this user is currently deactivated')
  }
} catch (err) {
  console.error('Failed to update role:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await pool.end()
}
