import { errorResponse } from '../../catalog/shared/schemas.js';

// ---------------------------------------------------------------------------
// Params schemas
// ---------------------------------------------------------------------------

const collectionItemIdParams = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const collectionPhotoIdParams = {
  type: 'object',
  required: ['id', 'photoId'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    photoId: { type: 'string', format: 'uuid' },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/** Collection photo — no status field (private photos, no approval). */
const collectionPhotoItem = {
  type: 'object',
  required: ['id', 'url', 'caption', 'is_primary', 'sort_order'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    caption: { type: ['string', 'null'] },
    is_primary: { type: 'boolean' },
    sort_order: { type: 'integer' },
  },
} as const;

/** Extended collection photo with contribution status — used only in list response. */
const collectionPhotoListItem = {
  type: 'object',
  required: ['id', 'url', 'caption', 'is_primary', 'sort_order', 'contribution_status'],
  additionalProperties: false,
  properties: {
    ...collectionPhotoItem.properties,
    contribution_status: { type: ['string', 'null'] },
  },
} as const;

const duplicatePhotoError = {
  type: 'object',
  required: ['error', 'matched'],
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    matched: {
      type: 'object',
      required: ['id', 'url'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        url: { type: 'string' },
      },
    },
  },
} as const;

const contributeResponse = {
  type: 'object',
  required: ['contribution_id'],
  additionalProperties: false,
  properties: {
    contribution_id: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

export const uploadCollectionPhotosSchema = {
  description: 'Upload photos to a collection item.',
  tags: ['collection-photos'],
  summary: 'Upload collection photos',
  params: collectionItemIdParams,
  consumes: ['multipart/form-data'],
  response: {
    201: {
      type: 'object',
      required: ['photos'],
      additionalProperties: false,
      properties: {
        photos: { type: 'array', items: collectionPhotoItem },
      },
    },
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    409: duplicatePhotoError,
    413: errorResponse,
    500: errorResponse,
  },
} as const;

export const listCollectionPhotosSchema = {
  description: 'List photos for a collection item.',
  tags: ['collection-photos'],
  summary: 'List collection photos',
  params: collectionItemIdParams,
  response: {
    200: {
      type: 'object',
      required: ['photos'],
      additionalProperties: false,
      properties: {
        photos: { type: 'array', items: collectionPhotoListItem },
      },
    },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const deleteCollectionPhotoSchema = {
  description: 'Delete a photo from a collection item.',
  tags: ['collection-photos'],
  summary: 'Delete collection photo',
  params: collectionPhotoIdParams,
  response: {
    204: { type: 'null', description: 'Photo deleted' },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const setPrimaryCollectionPhotoSchema = {
  description: 'Set a photo as the primary photo for a collection item.',
  tags: ['collection-photos'],
  summary: 'Set primary collection photo',
  params: collectionPhotoIdParams,
  response: {
    200: {
      type: 'object',
      required: ['photo'],
      additionalProperties: false,
      properties: { photo: collectionPhotoItem },
    },
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
} as const;

export const reorderCollectionPhotosSchema = {
  description: 'Reorder photos for a collection item.',
  tags: ['collection-photos'],
  summary: 'Reorder collection photos',
  params: collectionItemIdParams,
  body: {
    type: 'object',
    required: ['photos'],
    additionalProperties: false,
    properties: {
      photos: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          required: ['id', 'sort_order'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', format: 'uuid' },
            sort_order: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['photos'],
      additionalProperties: false,
      properties: {
        photos: { type: 'array', items: collectionPhotoItem },
      },
    },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const contributePhotoSchema = {
  description: 'Contribute a collection photo to the shared catalog.',
  tags: ['collection-photos'],
  summary: 'Contribute photo to catalog',
  params: collectionPhotoIdParams,
  body: {
    type: 'object',
    required: ['consent_version', 'consent_acknowledged', 'intent'],
    additionalProperties: false,
    properties: {
      consent_version: { type: 'string', minLength: 1 },
      consent_acknowledged: { type: 'boolean' },
      intent: { type: 'string', enum: ['training_only', 'catalog_and_training'] },
    },
  },
  response: {
    201: contributeResponse,
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
} as const;

export const revokeContributionSchema = {
  description: 'Revoke a photo contribution.',
  tags: ['collection-photos'],
  summary: 'Revoke contribution',
  params: collectionPhotoIdParams,
  response: {
    200: {
      type: 'object',
      required: ['revoked'],
      additionalProperties: false,
      properties: { revoked: { type: 'boolean' } },
    },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
