import { errorResponse, slugNameRef, nullableSlugNameRef } from '../shared/schemas.js';

const searchResultItem = {
  type: 'object',
  required: [
    'entity_type',
    'id',
    'name',
    'slug',
    'franchise',
    'continuity_family',
    'character',
    'manufacturer',
    'toy_line',
    'thumbnail_url',
    'size_class',
    'year_released',
    'is_third_party',
    'data_quality',
  ],
  additionalProperties: false,
  properties: {
    entity_type: { type: 'string', enum: ['character', 'item'] },
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    continuity_family: nullableSlugNameRef,
    character: nullableSlugNameRef,
    manufacturer: nullableSlugNameRef,
    toy_line: nullableSlugNameRef,
    thumbnail_url: { type: ['string', 'null'] },
    size_class: { type: ['string', 'null'] },
    year_released: { type: ['integer', 'null'] },
    is_third_party: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
    data_quality: { type: ['string', 'null'] },
  },
} as const;

export const searchSchema = {
  description: 'Full-text search across characters and items. Supports prefix matching on the last word.',
  tags: ['catalog-search'],
  summary: 'Search catalog',
  querystring: {
    type: 'object',
    required: ['q'],
    additionalProperties: false,
    properties: {
      q: { type: 'string', minLength: 1, maxLength: 200 },
      franchise: { type: 'string', minLength: 1, maxLength: 120 },
      type: { type: 'string', enum: ['character', 'item'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['data', 'page', 'limit', 'total_count', 'character_count', 'item_count'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: searchResultItem },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        total_count: { type: 'integer' },
        character_count: { type: 'integer' },
        item_count: { type: 'integer' },
      },
    },
    400: errorResponse,
    500: errorResponse,
  },
} as const;
