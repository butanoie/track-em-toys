import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { scanModels } from './scanner.js';
import { buildModelUrls } from './url-builder.js';
import { mlModelsSchema } from './schemas.js';

/**
 * Register ML model metadata routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function mlModelsRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get(
    '/',
    {
      schema: mlModelsSchema,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const { modelsPath, modelsBaseUrl } = config.ml;

      if (!modelsPath) {
        return { models: [] };
      }

      const scanned = await scanModels(modelsPath, request.log);

      return {
        models: scanned.map(({ metadata, onnxFilename, metadataFilename, sizeBytes }) => {
          const { download_url, metadata_url } = buildModelUrls(
            modelsBaseUrl,
            onnxFilename,
            metadataFilename
          );
          return {
            name: metadata.name,
            version: metadata.version,
            category: metadata.category,
            format: metadata.format,
            class_count: metadata.class_count,
            accuracy: metadata.accuracy,
            input_shape: metadata.input_shape,
            size_bytes: sizeBytes,
            download_url,
            metadata_url,
            trained_at: metadata.trained_at,
            exported_at: metadata.exported_at,
          };
        }),
      };
    }
  );
}
