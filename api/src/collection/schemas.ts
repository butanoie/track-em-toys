import { errorResponse, pageListResponse, slugNameRef } from '../catalog/shared/schemas.js';

const PACKAGE_CONDITION_ENUM = [
  'mint_sealed',
  'opened_complete',
  'opened_incomplete',
  'loose_complete',
  'loose_incomplete',
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
    'product_code',
    'franchise',
    'manufacturer',
    'toy_line',
    'thumbnail_url',
    'collection_photo_count',
    'package_condition',
    'item_condition',
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
    product_code: { type: ['string', 'null'] },
    franchise: slugNameRef,
    manufacturer: nullableSlugName,
    toy_line: slugNameRef,
    thumbnail_url: { type: ['string', 'null'] },
    collection_photo_count: { type: 'integer', minimum: 0 },
    package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
    item_condition: { type: 'integer', minimum: 1, maximum: 10 },
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
  description: "List the authenticated user's collection with optional filters and page-based pagination.",
  tags: ['collection'],
  summary: 'List collection',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      franchise: { type: 'string', maxLength: 120 },
      toy_line: { type: 'string', maxLength: 120 },
      package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
      item_condition_min: { type: 'integer', minimum: 1, maximum: 10 },
      search: { type: 'string', maxLength: 200 },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', enum: [20, 50, 100], default: 20 },
    },
  },
  response: {
    200: pageListResponse(collectionItemSchema),
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
      package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
      item_condition: { type: 'integer', minimum: 1, maximum: 10 },
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
      required: [
        'total_copies',
        'unique_items',
        'deleted_count',
        'by_franchise',
        'by_toy_line',
        'by_package_condition',
        'by_item_condition',
      ],
      additionalProperties: false,
      properties: {
        total_copies: { type: 'integer' },
        unique_items: { type: 'integer' },
        deleted_count: { type: 'integer' },
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
        by_toy_line: {
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
        by_package_condition: {
          type: 'array',
          items: {
            type: 'object',
            required: ['package_condition', 'count'],
            additionalProperties: false,
            properties: {
              package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
              count: { type: 'integer' },
            },
          },
        },
        by_item_condition: {
          type: 'array',
          items: {
            type: 'object',
            required: ['item_condition', 'count'],
            additionalProperties: false,
            properties: {
              item_condition: { type: 'integer', minimum: 1, maximum: 10 },
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
  description:
    'Update package condition, item condition, and/or notes on a collection entry. Returns 404 if soft-deleted.',
  tags: ['collection'],
  summary: 'Update collection item',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
      item_condition: { type: 'integer', minimum: 1, maximum: 10 },
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

/** Export item shape — slug-based, no UUIDs */
const exportItemSchema = {
  type: 'object',
  required: ['franchise_slug', 'item_slug', 'package_condition', 'item_condition', 'notes', 'added_at', 'deleted_at'],
  additionalProperties: false,
  properties: {
    franchise_slug: { type: 'string' },
    item_slug: { type: 'string' },
    package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
    item_condition: { type: 'integer', minimum: 1, maximum: 10 },
    notes: { type: ['string', 'null'] },
    added_at: { type: 'string' },
    deleted_at: { type: ['string', 'null'] },
  },
} as const;

/** GET /collection/export */
export const exportCollectionSchema = {
  description: "Export the authenticated user's collection as a portable, slug-based JSON file.",
  tags: ['collection'],
  summary: 'Export collection',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      include_deleted: { type: 'boolean', default: false },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['version', 'exported_at', 'items'],
      additionalProperties: false,
      properties: {
        version: { type: 'integer' },
        exported_at: { type: 'string' },
        items: { type: 'array', items: exportItemSchema },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** Import item shape — matches the export item shape that clients send back */
const importItemSchema = {
  type: 'object',
  required: ['franchise_slug', 'item_slug'],
  additionalProperties: false,
  properties: {
    franchise_slug: { type: 'string', minLength: 1, maxLength: 120 },
    item_slug: { type: 'string', minLength: 1, maxLength: 120 },
    package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
    item_condition: { type: 'integer', minimum: 1, maximum: 10 },
    notes: { type: ['string', 'null'], maxLength: 2000 },
    added_at: { type: 'string', maxLength: 100 },
  },
} as const;

/** Imported item in the response — includes resolved item name */
const importedItemSchema = {
  type: 'object',
  required: ['franchise_slug', 'item_slug', 'item_name', 'package_condition', 'item_condition'],
  additionalProperties: false,
  properties: {
    franchise_slug: { type: 'string' },
    item_slug: { type: 'string' },
    item_name: { type: 'string' },
    package_condition: { type: 'string', enum: PACKAGE_CONDITION_ENUM },
    item_condition: { type: 'integer', minimum: 1, maximum: 10 },
  },
} as const;

/** Unresolved item in the response — slug pair that could not be matched */
const unresolvedItemSchema = {
  type: 'object',
  required: ['franchise_slug', 'item_slug', 'reason'],
  additionalProperties: false,
  properties: {
    franchise_slug: { type: 'string' },
    item_slug: { type: 'string' },
    reason: { type: 'string' },
  },
} as const;

/** POST /collection/import */
export const importCollectionSchema = {
  description: 'Import a previously exported collection file. Resolves slugs and creates new entries.',
  tags: ['collection'],
  summary: 'Import collection',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['version', 'items'],
    additionalProperties: false,
    properties: {
      version: { type: 'integer', minimum: 1, maximum: 1 },
      mode: { type: 'string', enum: ['append', 'overwrite'], default: 'append' },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        items: importItemSchema,
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['imported', 'unresolved', 'overwritten_count'],
      additionalProperties: false,
      properties: {
        imported: { type: 'array', items: importedItemSchema },
        unresolved: { type: 'array', items: unresolvedItemSchema },
        overwritten_count: { type: 'integer' },
      },
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    500: errorResponse,
  },
} as const;
