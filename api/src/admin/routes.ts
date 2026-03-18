import type { FastifyInstance } from 'fastify';
import { withTransaction } from '../db/pool.js';
import * as queries from '../db/queries.js';
import * as adminQueries from './queries.js';
import {
  listUsersSchema,
  patchUserRoleSchema,
  deactivateUserSchema,
  reactivateUserSchema,
  deleteUserSchema,
} from './schemas.js';
import { HttpError } from '../auth/errors.js';
import { ROLE_HIERARCHY } from '../auth/role.js';
import type { UserRole } from '../types/index.js';

interface IdParams {
  id: string;
}
interface ListUsersQuery {
  role?: UserRole;
  email?: string;
  limit?: number;
  offset?: number;
}
interface RoleBody {
  role: UserRole;
}

const adminRateLimitRead = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;
const adminRateLimitWrite = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;
const adminRateLimitDelete = { rateLimit: { max: 5, timeWindow: '1 minute' } } as const;

/**
 * Register all admin routes under the /admin prefix.
 * All routes require admin role via preHandler chain.
 * Admin writes use withTransaction (unlike catalog reads which use pool.query directly).
 *
 * @param fastify - Fastify instance for route registration
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function adminRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  // ─── Content-Type enforcement ─────────────────────────────────────────
  // Reject non-JSON POST/PATCH requests to any route in this plugin scope.
  // Same pattern as auth routes (auth/routes.ts:467-479).

  fastify.addHook('preValidation', async (request, reply) => {
    if (request.method !== 'POST' && request.method !== 'PATCH') return;
    const contentType = request.headers['content-type'];
    if (contentType === undefined) return;
    const baseType = (contentType.split(';')[0] ?? '').trim();
    if (baseType !== 'application/json') {
      return reply.code(415).send({ error: 'Content-Type must be application/json' });
    }
  });

  // ─── Shared preHandler for all admin routes ─────────────────────────
  const adminPreHandler = [fastify.authenticate, fastify.requireRole('admin')];

  // ─── GET /users ─────────────────────────────────────────────────────────

  fastify.get<{ Querystring: ListUsersQuery }>(
    '/users',
    { schema: listUsersSchema, preHandler: adminPreHandler, config: adminRateLimitRead },
    async (request) => {
      const limit = Math.min(Math.max(request.query.limit ?? 20, 1), 100);
      const offset = Math.max(request.query.offset ?? 0, 0);

      const { rows, totalCount } = await adminQueries.listAdminUsers({
        role: request.query.role,
        email: request.query.email,
        limit,
        offset,
      });

      return { data: rows, total_count: totalCount, limit, offset };
    }
  );

  // ─── PATCH /users/:id/role ──────────────────────────────────────────────

  fastify.patch<{ Params: IdParams; Body: RoleBody }>(
    '/users/:id/role',
    { schema: patchUserRoleSchema, preHandler: adminPreHandler, config: adminRateLimitWrite },
    async (request, reply) => {
      // request.user is guaranteed to be { sub, role } by the adminPreHandler chain
      // (authenticate populates it, requireRole('admin') validates it)
      const actor = request.user;
      const targetId = request.params.id.toLowerCase();

      // Guard: no self-modification
      if (targetId === actor.sub) {
        return reply.code(403).send({ error: 'Cannot perform this action on your own account' });
      }

      // Guard: no escalation above own level
      if (ROLE_HIERARCHY[request.body.role] > ROLE_HIERARCHY[actor.role]) {
        return reply.code(403).send({ error: 'Cannot assign role above your own' });
      }

      const result = await withTransaction(async (client) => {
        const target = await adminQueries.findUserForAdmin(client, targetId);
        if (!target) throw new HttpError(404, { error: 'User not found' });
        if (target.deleted_at) throw new HttpError(409, { error: 'User has been permanently deleted' });

        // Guard: last-admin protection — prevent demoting the sole admin
        if (target.role === 'admin' && request.body.role !== 'admin') {
          const adminCount = await adminQueries.countActiveAdmins(client);
          if (adminCount <= 1) {
            throw new HttpError(409, { error: 'Cannot demote the last admin' });
          }
        }

        const oldRole = target.role;
        const updated = await adminQueries.updateUserRole(client, targetId, request.body.role);
        if (!updated) throw new HttpError(404, { error: 'User not found' });

        // Revoke refresh tokens when demoting (role hierarchy decreased)
        if (ROLE_HIERARCHY[request.body.role] < ROLE_HIERARCHY[oldRole]) {
          await queries.revokeAllUserRefreshTokens(client, targetId);
        }

        // Audit log — non-fatal
        try {
          await queries.logAuthEvent(client, {
            user_id: targetId,
            event_type: 'role_changed',
            ip_address: request.ip,
            user_agent: null,
            metadata: { initiated_by: actor.sub, old_role: oldRole, new_role: request.body.role },
          });
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for role_changed — role update will commit');
        }

        return updated;
      }, actor.sub);

      return result;
    }
  );

  // ─── POST /users/:id/deactivate ─────────────────────────────────────────

  fastify.post<{ Params: IdParams }>(
    '/users/:id/deactivate',
    { schema: deactivateUserSchema, preHandler: adminPreHandler, config: adminRateLimitWrite },
    async (request, reply) => {
      const actor = request.user;
      const targetId = request.params.id.toLowerCase();

      if (targetId === actor.sub) {
        return reply.code(403).send({ error: 'Cannot perform this action on your own account' });
      }

      const result = await withTransaction(async (client) => {
        const target = await adminQueries.findUserForAdmin(client, targetId);
        if (!target) throw new HttpError(404, { error: 'User not found' });
        if (target.deleted_at) throw new HttpError(409, { error: 'User has been permanently deleted' });

        // Idempotent: already deactivated — return current state
        if (target.deactivated_at) return target;

        await queries.deactivateUser(client, targetId);
        await queries.revokeAllUserRefreshTokens(client, targetId);

        // Audit log — non-fatal
        try {
          await queries.logAuthEvent(client, {
            user_id: targetId,
            event_type: 'account_deactivated',
            ip_address: request.ip,
            user_agent: null,
            metadata: { initiated_by: actor.sub },
          });
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for account_deactivated — deactivation will commit');
        }

        // Re-fetch to get updated state
        const updated = await adminQueries.findUserForAdmin(client, targetId);
        return updated ?? target;
      }, actor.sub);

      return result;
    }
  );

  // ─── POST /users/:id/reactivate ─────────────────────────────────────────

  fastify.post<{ Params: IdParams }>(
    '/users/:id/reactivate',
    { schema: reactivateUserSchema, preHandler: adminPreHandler, config: adminRateLimitWrite },
    async (request, reply) => {
      const actor = request.user;
      const targetId = request.params.id.toLowerCase();

      if (targetId === actor.sub) {
        return reply.code(403).send({ error: 'Cannot perform this action on your own account' });
      }

      const result = await withTransaction(async (client) => {
        const target = await adminQueries.findUserForAdmin(client, targetId);
        if (!target) throw new HttpError(404, { error: 'User not found' });
        if (target.deleted_at) throw new HttpError(409, { error: 'User has been permanently deleted' });

        // Idempotent: already active — return current state
        if (!target.deactivated_at) return target;

        const updated = await adminQueries.reactivateUser(client, targetId);
        if (!updated) throw new HttpError(404, { error: 'User not found' });

        // Audit log — non-fatal
        try {
          await queries.logAuthEvent(client, {
            user_id: targetId,
            event_type: 'account_reactivated',
            ip_address: request.ip,
            user_agent: null,
            metadata: { initiated_by: actor.sub },
          });
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for account_reactivated — reactivation will commit');
        }

        return updated;
      }, actor.sub);

      return result;
    }
  );

  // ─── DELETE /users/:id ──────────────────────────────────────────────────

  fastify.delete<{ Params: IdParams }>(
    '/users/:id',
    { schema: deleteUserSchema, preHandler: adminPreHandler, config: adminRateLimitDelete },
    async (request, reply) => {
      const actor = request.user;
      const targetId = request.params.id.toLowerCase();

      if (targetId === actor.sub) {
        return reply.code(403).send({ error: 'Cannot perform this action on your own account' });
      }

      await withTransaction(async (client) => {
        const target = await adminQueries.findUserForAdmin(client, targetId);
        if (!target) throw new HttpError(404, { error: 'User not found' });
        if (target.deleted_at) throw new HttpError(409, { error: 'User has already been purged' });

        await adminQueries.gdprPurgeUser(client, targetId);

        // Audit log — non-fatal. Logged AFTER purge so the event records the action.
        // The user_id FK still points to the tombstone row.
        try {
          await queries.logAuthEvent(client, {
            user_id: targetId,
            event_type: 'user_purged',
            ip_address: request.ip,
            user_agent: null,
            metadata: { initiated_by: actor.sub },
          });
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for user_purged — purge will commit');
        }
      }, actor.sub);

      return reply.code(204).send();
    }
  );
}
