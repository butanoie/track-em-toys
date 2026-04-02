import { pool } from '../../db/pool.js';

export interface InsertEventParams {
  userId: string;
  eventType: string;
  modelName: string | undefined;
  metadata: Record<string, unknown> | undefined;
}

export interface ModelBreakdown {
  model_name: string;
  scans: number;
  accepted: number;
}

export interface SummaryStats {
  total_scans: number;
  scans_completed: number;
  scans_failed: number;
  predictions_accepted: number;
  by_model: ModelBreakdown[];
}

export interface DailyRawRow {
  date: string;
  event_type: string;
  count: string;
}

export interface ModelStatsRow {
  model_name: string;
  total_scans: string;
  predictions_accepted: string;
  scans_failed: string;
  avg_confidence: string | null;
}

/**
 * Insert a single ML inference event.
 *
 * @param params - Event data to insert
 */
export async function insertMlEvent(params: InsertEventParams): Promise<void> {
  await pool.query(
    `INSERT INTO ml_inference_events (user_id, event_type, model_name, metadata)
     VALUES ($1, $2, $3, $4)`,
    [
      params.userId,
      params.eventType,
      params.modelName ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );
}

/**
 * Get aggregate stats for the given time window.
 *
 * @param days - Number of days to look back
 */
interface SummaryTotalsRow {
  total_scans: number;
  scans_completed: number;
  scans_failed: number;
  predictions_accepted: number;
}

interface ModelBreakdownRow {
  model_name: string;
  scans: string;
  accepted: string;
}

/**
 * Aggregate scan counts and per-model breakdown for the given time window.
 *
 * @param days - Number of days to look back
 */
export async function getSummaryStats(days: number): Promise<SummaryStats> {
  const interval = [days];

  const [totalsResult, modelResult] = await Promise.all([
    pool.query<SummaryTotalsRow>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'scan_started')::integer       AS total_scans,
         COUNT(*) FILTER (WHERE event_type = 'scan_completed')::integer     AS scans_completed,
         COUNT(*) FILTER (WHERE event_type = 'scan_failed')::integer        AS scans_failed,
         COUNT(*) FILTER (WHERE event_type = 'prediction_accepted')::integer AS predictions_accepted
       FROM ml_inference_events
       WHERE created_at > NOW() - ($1::integer * INTERVAL '1 day')`,
      interval,
    ),
    pool.query<ModelBreakdownRow>(
      `SELECT
         model_name,
         COUNT(*) FILTER (WHERE event_type = 'scan_started')::text AS scans,
         COUNT(*) FILTER (WHERE event_type = 'prediction_accepted')::text AS accepted
       FROM ml_inference_events
       WHERE created_at > NOW() - ($1::integer * INTERVAL '1 day')
         AND model_name IS NOT NULL
       GROUP BY model_name
       ORDER BY COUNT(*) DESC`,
      interval,
    ),
  ]);

  const totals = totalsResult.rows[0] ?? { total_scans: 0, scans_completed: 0, scans_failed: 0, predictions_accepted: 0 };

  return {
    ...totals,
    by_model: modelResult.rows.map((r) => ({
      model_name: r.model_name,
      scans: parseInt(r.scans, 10) || 0,
      accepted: parseInt(r.accepted, 10) || 0,
    })),
  };
}

/**
 * Get daily event counts for charting. Returns one row per (date, event_type).
 *
 * @param days - Number of days to look back
 */
export async function getDailyStats(days: number): Promise<DailyRawRow[]> {
  const result = await pool.query<DailyRawRow>(
    `SELECT
       d::date::text AS date,
       COALESCE(e.event_type, 'scan_started') AS event_type,
       COALESCE(e.count, 0)::text AS count
     FROM generate_series(
       (NOW() - ($1::integer * INTERVAL '1 day'))::date,
       NOW()::date,
       '1 day'::interval
     ) AS d
     LEFT JOIN (
       SELECT
         date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
         event_type,
         COUNT(*) AS count
       FROM ml_inference_events
       WHERE created_at > NOW() - ($1::integer * INTERVAL '1 day')
         AND event_type IN ('scan_started', 'scan_completed', 'scan_failed', 'prediction_accepted')
       GROUP BY 1, 2
     ) e ON e.day = d::date
     ORDER BY d`,
    [days]
  );
  return result.rows;
}

/**
 * Get per-model stats for comparison.
 *
 * @param days - Number of days to look back
 */
export async function getModelStats(days: number): Promise<ModelStatsRow[]> {
  const result = await pool.query<ModelStatsRow>(
    `SELECT
       model_name,
       COUNT(*) FILTER (WHERE event_type = 'scan_started')::text AS total_scans,
       COUNT(*) FILTER (WHERE event_type = 'prediction_accepted')::text               AS predictions_accepted,
       COUNT(*) FILTER (WHERE event_type = 'scan_failed')::text                       AS scans_failed,
       AVG(CASE WHEN event_type = 'scan_completed'
                THEN (metadata->>'top1_confidence')::float END)::text                 AS avg_confidence
     FROM ml_inference_events
     WHERE created_at > NOW() - ($1::integer * INTERVAL '1 day')
       AND model_name IS NOT NULL
     GROUP BY model_name
     ORDER BY COUNT(*) DESC`,
    [days]
  );
  return result.rows;
}
