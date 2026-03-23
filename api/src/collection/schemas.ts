import { errorResponse, cursorListResponse, slugNameRef } from '../catalog/shared/schemas.js';

const CONDITION_ENUM = [
  'mint_sealed',
  'opened_complete',
  'opened_incomplete',
  'loose_complete',
  'loose_incomplete',
  'damaged',
  'unknown',
] as const;

/**
 * Nullable slug+name reference using flat type union.
 * Do NOT reuse nullableSlugNameRef from shared schemas — it uses oneOf,
 * which fast-json-stringify does not support for serialization.
 */
const nullableSlugName = {
  type: ['object', 'null'] as const,
  required: ['slug', 'name'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

/** Full collection item shape returned by list, get, post, patch, and restore responses. */
export const collectionItemSchema = {
  type: 'object',
  required: [
    'id',
    'item_id',
    'item_name',
    'item_slug',
    'franchise',
    'manufacturer',
    'toy_line',
    'thumbnail_url',
    'condition',
    'notes',
    'created_at',
    'updated_at',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    item_id: { type: 'string' },
    item_name: { type: 'string' },
    item_slug: { type: 'string' },
    franchise: slugNameRef,
    manufacturer: nullableSlugName,
    toy_line: slugNameRef,
    thumbnail_url: { type: ['string', 'null'] },
    condition: { type: 'string', enum: CONDITION_ENUM },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const;

const uuidParam = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

/** GET /collection */
export const listCollectionSchema = {
  description: "List the authenticated user's collection with optional filters and cursor pagination.",
  tags: ['collection'],
  summary: 'List collection',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      franchise: { type: 'string', maxLength: 120 },
      condition: { type: 'string', enum: CONDITION_ENUM },
      search: { type: 'string', maxLength: 200 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      cursor: { type: 'string', maxLength: 512 },
    },
  },
  response: {
    200: cursorListResponse(collectionItemSchema),
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** POST /collection */
export const addCollectionItemSchema = {
  description: "Add a catalog item to the authenticated user's collection. One row per physical copy.",
  tags: ['collection'],
  summary: 'Add item',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['item_id'],
    additionalProperties: false,
    properties: {
      item_id: { type: 'string', format: 'uuid' },
      condition: { type: 'string', enum: CONDITION_ENUM },
      notes: { type: 'string', maxLength: 2000 },
    },
  },
  response: {
    201: collectionItemSchema,
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
  },
} as const;

/** GET /collection/stats */
export const collectionStatsSchema = {
  description: "Summary statistics for the authenticated user's collection.",
  tags: ['collection'],
  summary: 'Collection stats',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      required: ['total_copies', 'unique_items', 'by_franchise', 'by_condition'],
      additionalProperties: false,
      properties: {
        total_copies: { type: 'integer' },
        unique_items: { type: 'integer' },
        by_franchise: {
          type: 'array',
          items: {
            type: 'object',
            required: ['slug', 'name', 'count'],
            additionalProperties: false,
            properties: {
              slug: { type: 'string' },
              name: { type: 'string' },
              count: { type: 'integer' },
            },
          },
        },
        by_condition: {
          type: 'array',
          items: {
            type: 'object',
            required: ['condition', 'count'],
            additionalProperties: false,
            properties: {
              condition: { type: 'string', enum: CONDITION_ENUM },
              count: { type: 'integer' },
            },
          },
        },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** GET /collection/check */
export const checkCollectionSchema = {
  description: 'Batch-check which of up to 50 item IDs the user has in their collection.',
  tags: ['collection'],
  summary: 'Batch check items',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    required: ['itemIds'],
    additionalProperties: false,
    properties: {
      itemIds: { type: 'string', maxLength: 2048 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['items'],
      additionalProperties: false,
      properties: {
        items: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['count', 'collection_ids'],
            additionalProperties: false,
            properties: {
              count: { type: 'integer' },
              collection_ids: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** GET /collection/:id */
export const getCollectionItemSchema = {
  description: 'Get a single collection entry by its collection ID.',
  tags: ['collection'],
  summary: 'Get collection item',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    200: collectionItemSchema,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
  },
} as const;

/** PATCH /collection/:id */
export const patchCollectionItemSchema = {
  description: 'Update condition and/or notes on a collection entry. Returns 404 if soft-deleted.',
  tags: ['collection'],
  summary: 'Update collection item',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      condition: { type: 'string', enum: CONDITION_ENUM },
      notes: { type: ['string', 'null'], maxLength: 2000 },
    },
  },
  response: {
    200: collectionItemSchema,
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
  },
} as const;

/** DELETE /collection/:id */
export const deleteCollectionItemSchema = {
  description: 'Soft-delete a collection entry (sets deleted_at). Use POST /:id/restore to undo.',
  tags: ['collection'],
  summary: 'Soft-delete collection item',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    204: { type: 'null', description: 'No Content' },
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
  },
} as const;

/** POST /collection/:id/restore */
export const restoreCollectionItemSchema = {
  description: 'Restore a soft-deleted collection entry. Idempotent: returns 200 if item is already active.',
  tags: ['collection'],
  summary: 'Restore collection item',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    200: collectionItemSchema,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
  },
} as const;
