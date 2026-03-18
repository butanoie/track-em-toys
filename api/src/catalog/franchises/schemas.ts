import { errorResponse, slugParam } from '../shared/schemas.js';

const franchiseItem = {
  type: 'object',
  required: ['id', 'slug', 'name', 'sort_order', 'notes', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    sort_order: { type: ['integer', 'null'] },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
} as const;

export const listFranchisesSchema = {
  description: 'List all franchises.',
  tags: ['catalog'],
  summary: 'List franchises',
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: franchiseItem },
      },
    },
    500: errorResponse,
  },
} as const;

export const getFranchiseSchema = {
  description: 'Get a franchise by slug.',
  tags: ['catalog'],
  summary: 'Get franchise',
  params: slugParam,
  response: {
    200: franchiseItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
