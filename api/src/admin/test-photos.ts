import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { withTransaction } from '../db/pool.js';
import type { PoolClient } from '../db/pool.js';

/** Error response schema. */
const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;

/** Fastify route schema for POST /admin/test-photos/cleanup. */
const cleanupPendingPhotosSchema = {
  description:
    'Test-only endpoint: deletes seeded item_photos rows (and their photo_contributions) by id. Only available in non-production environments. Requires every id to belong to a row whose url begins with "test-pending/" — this prefix guard prevents accidental deletion of real catalog photos.',
  tags: ['admin', 'test'],
  summary: 'Cleanup pending photos (non-production only)',
  body: {
    type: 'object',
    required: ['item_photo_ids'],
    additionalProperties: false,
    properties: {
      item_photo_ids: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['deleted_item_photo_count', 'deleted_contribution_count'],
      additionalProperties: false,
      properties: {
        deleted_item_photo_count: { type: 'integer' },
        deleted_contribution_count: { type: 'integer' },
      },
    },
    400: errorResponse,
    500: errorResponse,
  },
} as const;

interface CleanupPendingPhotosBody {
  item_photo_ids: string[];
}

/** Fastify route schema for POST /admin/test-photos/seed. */
const seedPendingPhotoSchema = {
  description:
    'Test-only endpoint: seeds a pending item_photos row with an attached photo_contributions row for E2E testing. Only available in non-production environments. The contributor_email must end with @e2e.test.',
  tags: ['admin', 'test'],
  summary: 'Seed pending photo (non-production only)',
  body: {
    type: 'object',
    required: ['contributor_email', 'item_slug', 'franchise_slug', 'intent'],
    additionalProperties: false,
    properties: {
      contributor_email: { type: 'string', minLength: 5, pattern: '^[^@]+@e2e\\.test$' },
      item_slug: { type: 'string', minLength: 1, maxLength: 255 },
      franchise_slug: { type: 'string', minLength: 1, maxLength: 255 },
      intent: { type: 'string', enum: ['training_only', 'catalog_and_training'] },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['item_photo_id', 'contribution_id', 'contributor_id'],
      additionalProperties: false,
      properties: {
        item_photo_id: { type: 'string' },
        contribution_id: { type: 'string' },
        contributor_id: { type: 'string' },
      },
    },
    400: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

interface SeedPendingPhotoBody {
  contributor_email: string;
  item_slug: string;
  franchise_slug: string;
  intent: 'training_only' | 'catalog_and_training';
}

async function resolveItemId(client: PoolClient, itemSlug: string, franchiseSlug: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT i.id
     FROM items i
     INNER JOIN franchises f ON f.id = i.franchise_id
     WHERE i.slug = $1 AND f.slug = $2`,
    [itemSlug, franchiseSlug]
  );
  return rows[0]?.id ?? null;
}

async function upsertTestUser(client: PoolClient, email: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, email_verified, display_name, role)
     VALUES (LOWER($1), true, $2, 'user')
     ON CONFLICT (LOWER(email)) DO UPDATE SET
       email_verified = true,
       deactivated_at = NULL,
       deleted_at = NULL,
       updated_at = NOW()
     RETURNING id`,
    [email, email.split('@')[0] ?? 'E2E User']
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('User upsert returned no rows');
  return id;
}

/**
 * Test-only admin plugin: POST /test-photos/seed.
 *
 * Seeds a pending item_photos row plus an attached photo_contributions row
 * for the Photo Approval Dashboard E2E tests. Bypasses the normal contribute
 * flow (which requires a full collection item + photo file on disk).
 *
 * Security model:
 *   - Throws at registration if NODE_ENV === 'production' (defense in depth
 *     beyond the conditional dynamic import in server.ts)
 *   - No auth required — test infrastructure
 *   - contributor_email is constrained to the e2e.test domain by the schema pattern
 *   - Rate limited to 50/min (enough for a full E2E run, low enough to be
 *     noisy in a misconfigured staging env)
 *   - No file I/O — seeds DB state only. file_copied is set to true because
 *     the dashboard queries filter `file_copied = true` (Phase 1.6 crash-
 *     recovery state), but no on-disk artifact is created. The URL in
 *     item_photos.url is a test-only placeholder that the dashboard will
 *     display as a broken image — acceptable for state-level E2E assertions.
 *
 * The caller owns cleanup — the returned item_photo_id and contribution_id
 * should be deleted via direct DB access in the E2E fixture's teardown hook.
 *
 * @param fastify - Fastify instance to register the route on
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function testPhotosRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  if (config.nodeEnv === 'production') {
    throw new Error('test-photos route must never be registered in production');
  }

  fastify.post<{ Body: SeedPendingPhotoBody }>(
    '/seed',
    {
      schema: seedPendingPhotoSchema,
      config: { rateLimit: { max: 50, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { contributor_email, item_slug, franchise_slug, intent } = request.body;
      const visibility = intent === 'catalog_and_training' ? 'public' : 'training_only';

      try {
        const result = await withTransaction(async (client) => {
          const itemId = await resolveItemId(client, item_slug, franchise_slug);
          if (!itemId) return { error: 'Item not found' as const };

          const contributorId = await upsertTestUser(client, contributor_email);
          const itemPhotoId = randomUUID();

          // Insert the pending item_photos row. URL is a deterministic test-only
          // placeholder; no file is written to disk.
          await client.query(
            `INSERT INTO item_photos (id, item_id, url, uploaded_by, sort_order, dhash, status, visibility)
             VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6)`,
            [
              itemPhotoId,
              itemId,
              `test-pending/${itemPhotoId}-original.webp`,
              contributorId,
              `e2etest${itemPhotoId.replace(/-/g, '').slice(0, 10)}`,
              visibility,
            ]
          );

          // Insert the contribution row in its post-copy state (file_copied = true).
          const { rows: contribRows } = await client.query<{ id: string }>(
            `INSERT INTO photo_contributions
               (collection_item_photo_id, item_photo_id, contributed_by, item_id,
                consent_version, file_copied, status, intent)
             VALUES (NULL, $1, $2, $3, 'e2e-v1', true, 'pending', $4)
             RETURNING id`,
            [itemPhotoId, contributorId, itemId, intent]
          );
          const contributionId = contribRows[0]?.id;
          if (!contributionId) throw new Error('Contribution insert returned no rows');

          return {
            item_photo_id: itemPhotoId,
            contribution_id: contributionId,
            contributor_id: contributorId,
          };
        });

        if ('error' in result) {
          return reply.code(404).send({ error: result.error });
        }
        return result;
      } catch (err) {
        fastify.log.error({ err }, 'test-photos/seed failed');
        return reply.code(500).send({ error: 'Seed failed' });
      }
    }
  );

  fastify.post<{ Body: CleanupPendingPhotosBody }>(
    '/cleanup',
    {
      schema: cleanupPendingPhotosSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { item_photo_ids } = request.body;

      try {
        const result = await withTransaction(async (client) => {
          // Delete photo_contributions FIRST. The 1:N child rows must go before
          // the parent item_photos rows or the item_photo_id FK would either
          // fail (RESTRICT) or leave dangling references.
          //
          // The url-prefix guard on the parent table (below) is the primary
          // safety net — only test-shaped rows are deletable. We rely on the
          // join through item_photo_id to scope the contribution delete.
          const { rowCount: contribCount } = await client.query(
            `DELETE FROM photo_contributions
             WHERE item_photo_id = ANY($1::uuid[])
               AND item_photo_id IN (
                 SELECT id FROM item_photos
                 WHERE id = ANY($1::uuid[])
                   AND url LIKE 'test-pending/%'
               )`,
            [item_photo_ids]
          );

          // CRITICAL: the `url LIKE 'test-pending/%'` predicate is what
          // prevents this unauthenticated endpoint from being used to wipe
          // real catalog photos. The seed endpoint always writes URLs of the
          // form `test-pending/{uuid}-original.webp`; any row outside this
          // prefix is non-test data and must not be touched.
          const { rowCount: photoCount } = await client.query(
            `DELETE FROM item_photos
             WHERE id = ANY($1::uuid[])
               AND url LIKE 'test-pending/%'`,
            [item_photo_ids]
          );

          return {
            deleted_item_photo_count: photoCount ?? 0,
            deleted_contribution_count: contribCount ?? 0,
          };
        });

        return result;
      } catch (err) {
        fastify.log.error({ err }, 'test-photos/cleanup failed');
        return reply.code(500).send({ error: 'Cleanup failed' });
      }
    }
  );
}
