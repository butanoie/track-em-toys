import { errorResponse } from '../../catalog/shared/schemas.js';

const confusedPairItem = {
  type: 'object',
  required: ['true_label', 'predicted_label', 'count', 'pct_of_true_class'],
  additionalProperties: false,
  properties: {
    true_label: { type: 'string' },
    predicted_label: { type: 'string' },
    count: { type: 'integer' },
    pct_of_true_class: { type: 'number' },
  },
} as const;

const perClassItem = {
  type: 'object',
  required: ['label', 'accuracy'],
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    accuracy: { type: 'number' },
  },
} as const;

const qualityGatesItem = {
  type: 'object',
  required: ['accuracy_pass', 'size_pass'],
  additionalProperties: false,
  properties: {
    accuracy_pass: { type: 'boolean' },
    size_pass: { type: 'boolean' },
  },
} as const;

const modelQualityItem = {
  type: 'object',
  required: [
    'name',
    'version',
    'category',
    'accuracy',
    'class_count',
    'size_bytes',
    'trained_at',
    'metrics_available',
    'top3_accuracy',
    'quality_gates',
    'per_class_accuracy',
    'confused_pairs',
    'hyperparams',
  ],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    category: { type: 'string' },
    accuracy: { type: 'number' },
    class_count: { type: 'integer' },
    size_bytes: { type: 'integer' },
    trained_at: { type: 'string' },
    metrics_available: { type: 'boolean' },
    top3_accuracy: { type: ['number', 'null'] },
    quality_gates: qualityGatesItem,
    per_class_accuracy: { type: ['array', 'null'], items: perClassItem },
    confused_pairs: { type: ['array', 'null'], items: confusedPairItem },
    hyperparams: { type: ['object', 'null'] },
  },
} as const;

export const getModelQualitySchema = {
  description: 'Get model quality metrics (per-class accuracy, confused pairs, quality gates).',
  tags: ['ml'],
  summary: 'Model quality metrics',
  response: {
    200: {
      type: 'object',
      required: ['models'],
      additionalProperties: false,
      properties: {
        models: { type: 'array', items: modelQualityItem },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;
