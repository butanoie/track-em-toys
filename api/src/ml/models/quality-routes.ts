/**
 * ML model quality routes — serves training metrics from filesystem
 * (-metrics.json files) for the admin dashboard.
 */

import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { scanModels } from './scanner.js';
import { readModelMetrics, computeConfusedPairs } from './quality-reader.js';
import { getModelQualitySchema } from './quality-schemas.js';

const MIN_ACCURACY = 0.7;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Register model quality metric routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function mlModelQualityRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  const preHandler = [fastify.authenticate, fastify.requireRole('admin')] as const;

  fastify.get(
    '/',
    {
      schema: getModelQualitySchema,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      preHandler: [...preHandler],
    },
    async (request) => {
      const modelsPath = config.ml.modelsPath;
      if (!modelsPath) {
        return { models: [] };
      }

      const scanned = await scanModels(modelsPath, request.log);

      const models = await Promise.all(
        scanned.map(async ({ metadata, sizeBytes }) => {
          const metrics = await readModelMetrics(modelsPath, metadata.version, request.log);

          const perClassAccuracy = metrics
            ? Object.entries(metrics.per_class_accuracy)
                .map(([label, accuracy]) => ({ label, accuracy }))
                .sort((a, b) => a.accuracy - b.accuracy)
            : null;

          const confusedPairs = metrics
            ? computeConfusedPairs(metrics.confusion_matrix, metrics.label_map, 20)
            : null;

          return {
            name: metadata.name,
            version: metadata.version,
            category: metadata.category,
            accuracy: metadata.accuracy,
            class_count: metadata.class_count,
            size_bytes: sizeBytes,
            trained_at: metadata.trained_at,
            metrics_available: metrics !== null,
            top3_accuracy: metrics?.top3_accuracy ?? null,
            quality_gates: {
              accuracy_pass: metadata.accuracy >= MIN_ACCURACY,
              size_pass: sizeBytes <= MAX_SIZE_BYTES,
            },
            per_class_accuracy: perClassAccuracy,
            confused_pairs: confusedPairs,
            hyperparams: metrics?.hyperparams ?? null,
          };
        })
      );

      return { models };
    }
  );
}
