import { errorResponse } from '../../catalog/shared/schemas.js';

const ML_EVENT_TYPES = [
  'scan_started',
  'scan_completed',
  'scan_failed',
  'prediction_accepted',
  'scan_abandoned',
  'browse_catalog',
] as const;

export const postMlEventSchema = {
  description: 'Record an ML inference telemetry event.',
  tags: ['ml'],
  summary: 'Record ML event',
  body: {
    type: 'object',
    required: ['event_type'],
    additionalProperties: false,
    properties: {
      event_type: { type: 'string', enum: [...ML_EVENT_TYPES] },
      model_name: { type: 'string', maxLength: 120 },
      metadata: { type: 'object', maxProperties: 20 },
    },
  },
  response: {
    204: { type: 'null', description: 'Event recorded' },
    400: errorResponse,
    401: errorResponse,
  },
} as const;

const daysQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', enum: [7, 30, 90], default: 7 },
  },
} as const;

const modelBreakdownItem = {
  type: 'object',
  required: ['model_name', 'scans', 'accepted'],
  additionalProperties: false,
  properties: {
    model_name: { type: 'string' },
    scans: { type: 'integer' },
    accepted: { type: 'integer' },
  },
} as const;

const summaryResponse = {
  type: 'object',
  required: [
    'total_scans',
    'scans_completed',
    'scans_failed',
    'predictions_accepted',
    'acceptance_rate',
    'error_rate',
    'by_model',
  ],
  additionalProperties: false,
  properties: {
    total_scans: { type: 'integer' },
    scans_completed: { type: 'integer' },
    scans_failed: { type: 'integer' },
    predictions_accepted: { type: 'integer' },
    acceptance_rate: { type: 'number' },
    error_rate: { type: 'number' },
    by_model: { type: 'array', items: modelBreakdownItem },
  },
} as const;

export const getMlStatsSummarySchema = {
  description: 'Aggregate ML inference stats for the given time window.',
  tags: ['ml'],
  summary: 'ML stats summary',
  querystring: daysQuerystring,
  response: {
    200: summaryResponse,
    401: errorResponse,
    403: errorResponse,
  },
} as const;

const dailyPointItem = {
  type: 'object',
  required: ['date', 'scans_started', 'scans_completed', 'scans_failed', 'predictions_accepted'],
  additionalProperties: false,
  properties: {
    date: { type: 'string' },
    scans_started: { type: 'integer' },
    scans_completed: { type: 'integer' },
    scans_failed: { type: 'integer' },
    predictions_accepted: { type: 'integer' },
  },
} as const;

export const getMlStatsDailySchema = {
  description: 'Daily ML inference stats for charting.',
  tags: ['ml'],
  summary: 'ML stats daily breakdown',
  querystring: daysQuerystring,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: dailyPointItem },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;

const modelRowItem = {
  type: 'object',
  required: ['model_name', 'total_scans', 'predictions_accepted', 'scans_failed', 'avg_confidence'],
  additionalProperties: false,
  properties: {
    model_name: { type: 'string' },
    total_scans: { type: 'integer' },
    predictions_accepted: { type: 'integer' },
    scans_failed: { type: 'integer' },
    avg_confidence: { type: ['number', 'null'] },
  },
} as const;

export const getMlStatsModelsSchema = {
  description: 'Per-model ML inference stats comparison.',
  tags: ['ml'],
  summary: 'ML stats by model',
  querystring: daysQuerystring,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: modelRowItem },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;
