import { errorResponse } from '../../catalog/shared/schemas.js';

const modelSummaryItem = {
  type: 'object',
  required: [
    'name',
    'version',
    'category',
    'format',
    'class_count',
    'accuracy',
    'input_shape',
    'size_bytes',
    'download_url',
    'metadata_url',
    'trained_at',
    'exported_at',
  ],
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    category: { type: 'string' },
    format: { type: 'string' },
    class_count: { type: 'integer' },
    accuracy: { type: 'number' },
    input_shape: { type: 'array', items: { type: 'integer' } },
    size_bytes: { type: 'integer' },
    download_url: { type: ['string', 'null'] },
    metadata_url: { type: 'string' },
    trained_at: { type: 'string' },
    exported_at: { type: 'string' },
  },
} as const;

export const mlModelsSchema = {
  description:
    'List available trained ML models with metadata summaries. Label maps are excluded — fetch via metadata_url.',
  tags: ['ml'],
  summary: 'List ML models',
  response: {
    200: {
      type: 'object',
      required: ['models'],
      additionalProperties: false,
      properties: {
        models: { type: 'array', items: modelSummaryItem },
      },
    },
    401: errorResponse,
  },
} as const;
