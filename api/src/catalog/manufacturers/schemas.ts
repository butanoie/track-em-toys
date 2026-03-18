import { errorResponse, slugParam } from '../shared/schemas.js';

const manufacturerItem = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'is_official_licensee',
    'country',
    'website_url',
    'aliases',
    'notes',
    'created_at',
    'updated_at',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    is_official_licensee: { type: 'boolean' },
    country: { type: ['string', 'null'] },
    website_url: { type: ['string', 'null'] },
    aliases: { type: 'array', items: { type: 'string' } },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const;

export const listManufacturersSchema = {
  description: 'List all manufacturers.',
  tags: ['catalog'],
  summary: 'List manufacturers',
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: manufacturerItem },
      },
    },
    500: errorResponse,
  },
} as const;

export const getManufacturerSchema = {
  description: 'Get a manufacturer by slug.',
  tags: ['catalog'],
  summary: 'Get manufacturer',
  params: slugParam,
  response: {
    200: manufacturerItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
