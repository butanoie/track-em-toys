import { errorResponse, slugParam, itemListItem, facetValueItem, cursorListResponse } from '../shared/schemas.js';

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

// ---------------------------------------------------------------------------
// Manufacturer stats
// ---------------------------------------------------------------------------

const manufacturerStatsItem = {
  type: 'object',
  required: ['slug', 'name', 'is_official_licensee', 'country', 'item_count', 'toy_line_count', 'franchise_count'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    is_official_licensee: { type: 'boolean' },
    country: { type: ['string', 'null'] },
    item_count: { type: 'integer' },
    toy_line_count: { type: 'integer' },
    franchise_count: { type: 'integer' },
  },
} as const;

export const listManufacturerStatsSchema = {
  description: 'List all manufacturers with aggregate counts.',
  tags: ['catalog'],
  summary: 'List manufacturer stats',
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: manufacturerStatsItem },
      },
    },
    500: errorResponse,
  },
} as const;

// ---------------------------------------------------------------------------
// Manufacturer-scoped items list
// ---------------------------------------------------------------------------

const manufacturerItemsListQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    cursor: { type: 'string', maxLength: 512 },
    franchise: { type: 'string', minLength: 1, maxLength: 120 },
    size_class: { type: 'string', minLength: 1, maxLength: 120 },
    toy_line: { type: 'string', minLength: 1, maxLength: 120 },
    continuity_family: { type: 'string', minLength: 1, maxLength: 120 },
    is_third_party: { type: 'boolean' },
  },
} as const;

const manufacturerItemFiltersQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    franchise: { type: 'string', minLength: 1, maxLength: 120 },
    size_class: { type: 'string', minLength: 1, maxLength: 120 },
    toy_line: { type: 'string', minLength: 1, maxLength: 120 },
    continuity_family: { type: 'string', minLength: 1, maxLength: 120 },
    is_third_party: { type: 'boolean' },
  },
} as const;

export const listManufacturerItemsSchema = {
  description: 'List items by manufacturer with cursor-based pagination and optional filters.',
  tags: ['catalog'],
  summary: 'List manufacturer items',
  params: slugParam,
  querystring: manufacturerItemsListQuerystring,
  response: {
    200: cursorListResponse(itemListItem),
    400: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

// ---------------------------------------------------------------------------
// Manufacturer-scoped facets
// ---------------------------------------------------------------------------

export const getManufacturerItemFacetsSchema = {
  description: 'Get facet counts for items by manufacturer, with cross-filtering.',
  tags: ['catalog'],
  summary: 'Get manufacturer item facets',
  params: slugParam,
  querystring: manufacturerItemFiltersQuerystring,
  response: {
    200: {
      type: 'object',
      required: ['franchises', 'size_classes', 'toy_lines', 'continuity_families', 'is_third_party'],
      additionalProperties: false,
      properties: {
        franchises: { type: 'array', items: facetValueItem },
        size_classes: { type: 'array', items: facetValueItem },
        toy_lines: { type: 'array', items: facetValueItem },
        continuity_families: { type: 'array', items: facetValueItem },
        is_third_party: { type: 'array', items: facetValueItem },
      },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const;
