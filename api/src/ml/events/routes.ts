import type { FastifyInstance } from 'fastify';
import { insertMlEvent, getSummaryStats, getDailyStats, getModelStats } from './queries.js';
import {
  postMlEventSchema,
  getMlStatsSummarySchema,
  getMlStatsDailySchema,
  getMlStatsModelsSchema,
} from './schemas.js';

interface EventBody {
  event_type: string;
  model_name?: string;
  metadata?: Record<string, unknown>;
}

interface DaysQuery {
  days?: number;
}

/**
 * Register ML event write route (POST /ml/events).
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function mlEventWriteRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.post<{ Body: EventBody }>(
    '/',
    {
      schema: postMlEventSchema,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        await insertMlEvent({
          userId: request.user.sub,
          eventType: request.body.event_type,
          modelName: request.body.model_name,
          metadata: request.body.metadata,
        });
      } catch (err) {
        // Telemetry insert failures are non-fatal — log and return 204 anyway
        request.log.error({ err }, 'ML event insert failed');
      }
      return reply.code(204).send();
    }
  );
}

/**
 * Pivot daily raw rows into chart-friendly points.
 *
 * @param rows - Raw rows from getDailyStats query
 */
function pivotDailyRows(rows: { date: string; event_type: string; count: string }[]): {
  date: string;
  scans_started: number;
  scans_completed: number;
  scans_failed: number;
  predictions_accepted: number;
}[] {
  const map = new Map<
    string,
    { date: string; scans_started: number; scans_completed: number; scans_failed: number; predictions_accepted: number }
  >();

  for (const row of rows) {
    let point = map.get(row.date);
    if (!point) {
      point = { date: row.date, scans_started: 0, scans_completed: 0, scans_failed: 0, predictions_accepted: 0 };
      map.set(row.date, point);
    }
    const count = parseInt(row.count, 10) || 0;
    if (row.event_type === 'scan_started') point.scans_started = count;
    else if (row.event_type === 'scan_completed') point.scans_completed = count;
    else if (row.event_type === 'scan_failed') point.scans_failed = count;
    else if (row.event_type === 'prediction_accepted') point.predictions_accepted = count;
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Register ML stats read routes (GET /ml/stats/*).
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function mlStatsRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  const statsPreHandler = [fastify.authenticate, fastify.requireRole('admin')] as const;
  const statsRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;

  fastify.get<{ Querystring: DaysQuery }>(
    '/summary',
    {
      schema: getMlStatsSummarySchema,
      config: statsRateLimit,
      preHandler: [...statsPreHandler],
    },
    async (request) => {
      const days = request.query.days ?? 7;
      const stats = await getSummaryStats(days);
      return {
        ...stats,
        acceptance_rate: stats.total_scans > 0 ? stats.predictions_accepted / stats.total_scans : 0,
        error_rate: stats.total_scans > 0 ? stats.scans_failed / stats.total_scans : 0,
      };
    }
  );

  fastify.get<{ Querystring: DaysQuery }>(
    '/daily',
    {
      schema: getMlStatsDailySchema,
      config: statsRateLimit,
      preHandler: [...statsPreHandler],
    },
    async (request) => {
      const days = request.query.days ?? 7;
      const rows = await getDailyStats(days);
      return { data: pivotDailyRows(rows) };
    }
  );

  fastify.get<{ Querystring: DaysQuery }>(
    '/models',
    {
      schema: getMlStatsModelsSchema,
      config: statsRateLimit,
      preHandler: [...statsPreHandler],
    },
    async (request) => {
      const days = request.query.days ?? 7;
      const rows = await getModelStats(days);
      return {
        data: rows.map((r) => ({
          model_name: r.model_name,
          total_scans: parseInt(r.total_scans, 10) || 0,
          predictions_accepted: parseInt(r.predictions_accepted, 10) || 0,
          scans_failed: parseInt(r.scans_failed, 10) || 0,
          avg_confidence: r.avg_confidence ? parseFloat(r.avg_confidence) : null,
        })),
      };
    }
  );
}
