import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { config } from '../../config.js';
import { getItemIdBySlug } from '../items/queries.js';
import * as photoQueries from './queries.js';
import { photoDir, photoPath, photoRelativeUrl, ensureDir, writePhoto, deletePhotoFiles } from './storage.js';
import { processUpload } from './thumbnails.js';
import { uploadPhotosSchema, deletePhotoSchema, setPrimarySchema, reorderPhotosSchema } from './schemas.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILES = 10;

const writeRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;
const mutationRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;

interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}

interface PhotoIdParams extends FranchiseSlugParams {
  photoId: string;
}

interface ReorderBody {
  photos: Array<{ id: string; sort_order: number }>;
}

/**
 * Register photo management routes under /:slug/photos.
 *
 * @param fastify - Fastify instance
 * @param _opts - Plugin options (unused)
 */
export async function photoRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(multipart, {
    limits: {
      fileSize: config.photos.maxSizeMb * 1024 * 1024,
      files: MAX_FILES,
    },
  });

  const curatorPreHandler = [fastify.authenticate, fastify.requireRole('curator')];

  fastify.post<{ Params: FranchiseSlugParams }>(
    '/',
    { schema: uploadPhotosSchema, preHandler: curatorPreHandler, config: writeRateLimit },
    async (request, reply) => {
      const itemId = await getItemIdBySlug(request.params.franchise, request.params.slug);
      if (!itemId) return reply.code(404).send({ error: 'Item not found' });

      const processed: Array<{
        photoId: string;
        thumb: Buffer;
        gallery: Buffer;
        original: Buffer;
      }> = [];

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

        let result;
        try {
          result = await processUpload(inputBuffer);
        } catch {
          return reply.code(400).send({ error: 'Invalid image file' });
        }

        processed.push({ photoId: randomUUID(), ...result });
      }

      if (processed.length === 0) {
        return reply.code(400).send({ error: 'No image files provided' });
      }

      const dir = photoDir(config.photos.storagePath, itemId);
      await ensureDir(dir);

      for (const p of processed) {
        const path = (size: 'thumb' | 'gallery' | 'original') =>
          photoPath(config.photos.storagePath, itemId, p.photoId, size);
        await Promise.all([
          writePhoto(path('thumb'), p.thumb),
          writePhoto(path('gallery'), p.gallery),
          writePhoto(path('original'), p.original),
        ]);
      }

      const maxSort = await photoQueries.getMaxSortOrder(itemId);
      const photos = [];

      try {
        for (let i = 0; i < processed.length; i++) {
          const p = processed[i]!;
          const row = await photoQueries.insertPhoto({
            id: p.photoId,
            itemId,
            url: photoRelativeUrl(itemId, p.photoId),
            uploadedBy: request.user.sub,
            sortOrder: maxSort + i + 1,
          });
          photos.push(row);
        }
      } catch (err) {
        for (const p of processed) {
          try {
            await deletePhotoFiles(config.photos.storagePath, itemId, p.photoId);
          } catch {
            /* best-effort cleanup */
          }
        }
        throw err;
      }

      return reply.code(201).send({ photos });
    }
  );

  // Registered before /:photoId so "reorder" matches the static segment first
  fastify.patch<{ Params: FranchiseSlugParams; Body: ReorderBody }>(
    '/reorder',
    { schema: reorderPhotosSchema, preHandler: curatorPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const itemId = await getItemIdBySlug(request.params.franchise, request.params.slug);
      if (!itemId) return reply.code(404).send({ error: 'Item not found' });

      const photos = await photoQueries.reorderPhotos(itemId, request.body.photos);
      return { photos };
    }
  );

  fastify.delete<{ Params: PhotoIdParams }>(
    '/:photoId',
    { schema: deletePhotoSchema, preHandler: curatorPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const itemId = await getItemIdBySlug(request.params.franchise, request.params.slug);
      if (!itemId) return reply.code(404).send({ error: 'Item not found' });

      const deleted = await photoQueries.deletePhoto(request.params.photoId, itemId);
      if (!deleted) return reply.code(404).send({ error: 'Photo not found' });

      try {
        await deletePhotoFiles(config.photos.storagePath, itemId, request.params.photoId);
      } catch (err) {
        request.log.error(
          { err, itemId, photoId: request.params.photoId },
          'Failed to delete photo files after DB delete — files may be orphaned'
        );
        throw err;
      }

      return reply.code(204).send();
    }
  );

  fastify.patch<{ Params: PhotoIdParams }>(
    '/:photoId/primary',
    { schema: setPrimarySchema, preHandler: curatorPreHandler, config: mutationRateLimit },
    async (request, reply) => {
      const itemId = await getItemIdBySlug(request.params.franchise, request.params.slug);
      if (!itemId) return reply.code(404).send({ error: 'Item not found' });

      let photo;
      try {
        photo = await photoQueries.setPhotoAsPrimary(request.params.photoId, itemId);
      } catch (err) {
        // Concurrent SET PRIMARY can hit the partial unique index
        if (err instanceof Error && err.message.includes('idx_item_photos_one_primary')) {
          return reply.code(409).send({ error: 'Concurrent primary photo update. Please retry.' });
        }
        throw err;
      }

      if (!photo) return reply.code(404).send({ error: 'Photo not found' });
      return { photo };
    }
  );
}
