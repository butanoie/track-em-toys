import { errorResponse } from '../shared/schemas.js';

const mlExportWarningItem = {
  type: 'object',
  required: ['label', 'photo_count', 'message'],
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    photo_count: { type: 'integer' },
    message: { type: 'string' },
  },
} as const;

const mlExportStatsItem = {
  type: 'object',
  required: ['total_photos', 'items', 'franchises', 'low_photo_items'],
  additionalProperties: false,
  properties: {
    total_photos: { type: 'integer' },
    items: { type: 'integer' },
    franchises: { type: 'integer' },
    low_photo_items: { type: 'integer' },
  },
} as const;

export const mlExportSchema = {
  description:
    'Export a manifest of item photos for ML training. Use q for search-based export, or franchise with optional filters for browse-based export. At least one of q or franchise is required.',
  tags: ['ml-export'],
  summary: 'Export ML training manifest',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string', minLength: 1, maxLength: 200 },
      franchise: { type: 'string', minLength: 1, maxLength: 120 },
      manufacturer: { type: 'string', minLength: 1, maxLength: 120 },
      size_class: { type: 'string', minLength: 1, maxLength: 120 },
      toy_line: { type: 'string', minLength: 1, maxLength: 120 },
      continuity_family: { type: 'string', minLength: 1, maxLength: 120 },
      is_third_party: { type: 'boolean' },
      character: { type: 'string', minLength: 1, maxLength: 120 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['exported_at', 'filename', 'stats', 'warnings'],
      additionalProperties: false,
      properties: {
        exported_at: { type: 'string' },
        filename: { type: 'string' },
        stats: mlExportStatsItem,
        warnings: { type: 'array', items: mlExportWarningItem },
      },
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    500: errorResponse,
  },
} as const;
