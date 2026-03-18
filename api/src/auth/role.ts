import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UserRole } from '../types/index.js'

/**
 * Numeric hierarchy for role comparison. Higher value = more privileges.
 * requireRole('curator') grants access to curators AND admins.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  curator: 1,
  admin: 2,
} as const

const VALID_ROLES = new Set<string>(['user', 'curator', 'admin'])

/**
 * Check if the actual role meets or exceeds the required role level.
 *
 * @param actual - The user's current role
 * @param required - The minimum role required
 */
export function hasRequiredRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required]
}

/**
 * Type guard: validates a JWT payload contains a valid sub and role claim.
 * Returns false for pre-migration tokens (no role claim) or tampered values.
 *
 * Defense-in-depth: even if an unknown role like 'superadmin' passed JWT
 * verification, ROLE_HIERARCHY[unknown] returns undefined, and
 * undefined >= 0 is false — so hasRequiredRole fails safely.
 */
export function isRolePayload(
  user: unknown,
): user is { sub: string; role: UserRole } {
  if (typeof user !== 'object' || user === null) return false
  const u = user as Record<string, unknown>
  return typeof u.sub === 'string' && typeof u.role === 'string' && VALID_ROLES.has(u.role)
}

/**
 * Fastify preHandler factory that enforces a minimum role level.
 * Must be used AFTER fastify.authenticate in the preHandler array —
 * authenticate populates request.user via jwtVerify().
 *
 * @param minRole - The minimum role required to access the route
 */
export function requireRole(
  minRole: UserRole,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/require-await -- must match Fastify preHandler async signature
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isRolePayload(request.user)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (!hasRequiredRole(request.user.role, minRole)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
  }
}
