import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { config } from '../../config.js';
import { withTransaction } from '../../db/pool.js';
import { processUpload, DimensionError } from '../../catalog/photos/thumbnails.js';
import { computeDHash, hammingDistance } from '../../catalog/photos/dhash.js';
import {
  photoDir as catalogPhotoDir,
  photoPath as catalogPhotoPath,
  photoRelativeUrl as catalogPhotoRelativeUrl,
  ensureDir as ensureCatalogDir,
  writePhoto as writeCatalogPhoto,
  deletePhotoFiles as deleteCatalogPhotoFiles,
} from '../../catalog/photos/storage.js';
import * as photoQueries from './queries.js';
import type { PhotoHashRow } from './queries.js';
import {
  collectionPhotoDir,
  collectionPhotoPath,
  collectionPhotoRelativeUrl,
  ensureDir,
  writePhoto,
  deleteCollectionPhotoFiles,
} from './storage.js';
import {
  uploadCollectionPhotosSchema,
  listCollectionPhotosSchema,
  deleteCollectionPhotoSchema,
  setPrimaryCollectionPhotoSchema,
  reorderCollectionPhotosSchema,
  contributePhotoSchema,
  revokeContributionSchema,
} from './schemas.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILES = 10;
const DHASH_THRESHOLD = 10;

const writeRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;
const mutationRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;
const readRateLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } } as const;

interface CollectionItemIdParams {
  id: string;
}

interface CollectionPhotoIdParams extends CollectionItemIdParams {
  photoId: string;
}

interface ContributeBody {
  consent_version: string;
  consent_acknowledged: boolean;
}

interface ReorderBody {
  photos: Array<{ id: string; sort_order: number }>;
}

/**
 * Register collection photo routes under /:id/photos.
 *
 * @param fastify - Fastify instance
 * @param _opts - Plugin options (unused)
 */
export async function collectionPhotoRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(multipart, {
    limits: {
      fileSize: config.photos.maxSizeMb * 1024 * 1024,
      files: MAX_FILES,
    },
  });

  const authPreHandler = [fastify.authenticate, fastify.requireRole('user')];

  // ─── POST / — Upload photos ────────────────────────────────────────────

  fastify.post<{ Params: CollectionItemIdParams }>(
    '/',
    { schema: uploadCollectionPhotosSchema, preHandler: authPreHandler, config: writeRateLimit },
    async (request, reply) => {
      const collectionItemId = request.params.id;
      const userId = request.user.sub;

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });

        const processed: Array<{
          photoId: string;
          dhash: string;
          thumb: Buffer;
          original: Buffer;
        }> = [];

        const existingHashes = await photoQueries.getPhotoHashesByCollectionItem(client, collectionItemId);
        const batchHashes: PhotoHashRow[] = [];

        const parts = request.parts();
        for await (const part of parts) {
          if (part.type !== 'file') continue;

          if (!ALLOWED_MIME_TYPES.has(part.mimetype)) {
            return reply.code(400).send({
              error: `Unsupported image type: ${part.mimetype}. Allowed: JPEG, PNG, WebP, GIF`,
            });
          }

          let inputBuffer: Buffer;
          try {
            inputBuffer = await part.toBuffer();
          } catch {
            return reply.code(413).send({ error: `File exceeds maximum size of ${config.photos.maxSizeMb}MB` });
          }

          let dhash: string;
          let result;
          try {
            dhash = await computeDHash(inputBuffer);

            const allHashes = [...existingHashes, ...batchHashes];
            const match = allHashes.find((h) => hammingDistance(dhash, h.dhash) <= DHASH_THRESHOLD);
            if (match) {
              return reply.code(409).send({
                error: 'Duplicate photo detected',
                matched: { id: match.id, url: match.url },
              });
            }

            result = await processUpload(inputBuffer);
          } catch (err) {
            if (err instanceof DimensionError) {
              return reply.code(400).send({ error: err.message });
            }
            return reply.code(400).send({ error: 'Invalid image file' });
          }

          const photoId = randomUUID();
          batchHashes.push({ id: photoId, url: collectionPhotoRelativeUrl(userId, collectionItemId, photoId), dhash });
          processed.push({ photoId, dhash, ...result });
        }

        if (processed.length === 0) {
          return reply.code(400).send({ error: 'No image files provided' });
        }

        const dir = collectionPhotoDir(config.photos.storagePath, userId, collectionItemId);
        await ensureDir(dir);

        for (const p of processed) {
          const path = (size: 'thumb' | 'original') =>
            collectionPhotoPath(config.photos.storagePath, userId, collectionItemId, p.photoId, size);
          await Promise.all([writePhoto(path('thumb'), p.thumb), writePhoto(path('original'), p.original)]);
        }

        const maxSort = await photoQueries.getMaxSortOrder(client, collectionItemId);
        const photos = [];

        try {
          for (let i = 0; i < processed.length; i++) {
            const p = processed[i]!;
            const row = await photoQueries.insertCollectionPhoto(client, {
              id: p.photoId,
              collectionItemId,
              userId,
              url: collectionPhotoRelativeUrl(userId, collectionItemId, p.photoId),
              sortOrder: maxSort + i + 1,
              dhash: p.dhash,
            });
            photos.push(row);
          }
        } catch (err) {
          for (const p of processed) {
            try {
              await deleteCollectionPhotoFiles(config.photos.storagePath, userId, collectionItemId, p.photoId);
            } catch {
              /* best-effort cleanup */
            }
          }
          throw err;
        }

        return reply.code(201).send({ photos });
      }, userId);
    }
  );

  // ─── GET / — List photos ───────────────────────────────────────────────

  fastify.get<{ Params: CollectionItemIdParams }>(
    '/',
    { schema: listCollectionPhotosSchema, preHandler: authPreHandler, config: readRateLimit },
    async (request, reply) => {
      const collectionItemId = request.params.id;

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });

        const photos = await photoQueries.listCollectionPhotos(client, collectionItemId);
        return { photos };
      }, request.user.sub);
    }
  );

  // ─── PATCH /reorder — Reorder photos (must precede /:photoId) ──────────

  fastify.patch<{ Params: CollectionItemIdParams; Body: ReorderBody }>(
    '/reorder',
    { schema: reorderCollectionPhotosSchema, preHandler: authPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const collectionItemId = request.params.id;

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });

        const photos = await photoQueries.reorderCollectionPhotos(client, collectionItemId, request.body.photos);
        return { photos };
      }, request.user.sub);
    }
  );

  // ─── DELETE /:photoId — Delete photo ───────────────────────────────────

  fastify.delete<{ Params: CollectionPhotoIdParams }>(
    '/:photoId',
    { schema: deleteCollectionPhotoSchema, preHandler: authPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const { id: collectionItemId, photoId } = request.params;
      const userId = request.user.sub;

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });

        const deleted = await photoQueries.deleteCollectionPhoto(client, photoId, collectionItemId);
        if (!deleted) return reply.code(404).send({ error: 'Photo not found' });

        try {
          await deleteCollectionPhotoFiles(config.photos.storagePath, userId, collectionItemId, photoId);
        } catch (err) {
          request.log.error(
            { err, collectionItemId, photoId },
            'Failed to delete collection photo files after DB delete — files may be orphaned'
          );
        }

        return reply.code(204).send();
      }, userId);
    }
  );

  // ─── PATCH /:photoId/primary — Set primary photo ───────────────────────

  fastify.patch<{ Params: CollectionPhotoIdParams }>(
    '/:photoId/primary',
    { schema: setPrimaryCollectionPhotoSchema, preHandler: authPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const { id: collectionItemId, photoId } = request.params;

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });

        let photo;
        try {
          photo = await photoQueries.setCollectionPhotoPrimary(client, photoId, collectionItemId);
        } catch (err) {
          if (err instanceof Error && err.message.includes('idx_collection_item_photos_one_primary')) {
            return reply.code(409).send({ error: 'Concurrent primary photo update. Please retry.' });
          }
          throw err;
        }

        if (!photo) return reply.code(404).send({ error: 'Photo not found' });
        return { photo };
      }, request.user.sub);
    }
  );

  // ─── POST /:photoId/contribute — Contribute to catalog ─────────────────

  fastify.post<{ Params: CollectionPhotoIdParams; Body: ContributeBody }>(
    '/:photoId/contribute',
    { schema: contributePhotoSchema, preHandler: authPreHandler, config: writeRateLimit },
    async (request, reply) => {
      const { id: collectionItemId, photoId } = request.params;
      const { consent_version, consent_acknowledged } = request.body;
      const userId = request.user.sub;

      if (!consent_acknowledged) {
        return reply.code(400).send({ error: 'Consent must be acknowledged' });
      }

      return withTransaction(async (client) => {
        const itemRef = await photoQueries.getCollectionItemRef(client, collectionItemId);
        if (!itemRef) return reply.code(404).send({ error: 'Collection item not found' });
        const catalogItemId = itemRef.item_id;

        const photo = await photoQueries.getCollectionPhotoById(client, photoId, collectionItemId);
        if (!photo) return reply.code(404).send({ error: 'Photo not found' });

        const existing = await photoQueries.getActiveContribution(client, photoId);
        if (existing) {
          return reply.code(409).send({ error: 'This photo has already been contributed' });
        }

        const contribution = await photoQueries.insertContribution(client, {
          collectionItemPhotoId: photoId,
          contributedBy: userId,
          itemId: catalogItemId,
          consentVersion: consent_version,
        });

        const newPhotoId = randomUUID();
        const catalogDir = catalogPhotoDir(config.photos.storagePath, catalogItemId);
        await ensureCatalogDir(catalogDir);

        try {
          for (const size of ['thumb', 'original'] as const) {
            const srcPath = collectionPhotoPath(config.photos.storagePath, userId, collectionItemId, photoId, size);
            const destPath = catalogPhotoPath(config.photos.storagePath, catalogItemId, newPhotoId, size);
            const data = await readFile(srcPath);
            await writeCatalogPhoto(destPath, data);
          }
        } catch (err) {
          try {
            await deleteCatalogPhotoFiles(config.photos.storagePath, catalogItemId, newPhotoId);
          } catch {
            /* best-effort */
          }
          throw err;
        }

        const catalogUrl = catalogPhotoRelativeUrl(catalogItemId, newPhotoId);
        await photoQueries.insertPendingCatalogPhoto(client, {
          id: newPhotoId,
          itemId: catalogItemId,
          url: catalogUrl,
          uploadedBy: userId,
          dhash: photo.dhash,
        });

        await photoQueries.updateContributionCopied(client, contribution.id, newPhotoId);

        return reply.code(201).send({ contribution_id: contribution.id });
      }, userId);
    }
  );

  // ─── DELETE /:photoId/contribution — Revoke contribution ───────────────

  fastify.delete<{ Params: CollectionPhotoIdParams }>(
    '/:photoId/contribution',
    { schema: revokeContributionSchema, preHandler: authPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const { id: collectionItemId, photoId } = request.params;
      const userId = request.user.sub;

      return withTransaction(async (client) => {
        const photo = await photoQueries.getCollectionPhotoById(client, photoId, collectionItemId);
        if (!photo) return reply.code(404).send({ error: 'Photo not found' });

        const revoked = await photoQueries.revokeContribution(client, photoId, userId);
        return { revoked };
      }, userId);
    }
  );
}
