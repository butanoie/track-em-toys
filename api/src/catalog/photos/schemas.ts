import { errorResponse, franchiseSlugParams } from '../shared/schemas.js';

// ---------------------------------------------------------------------------
// Params schemas
// ---------------------------------------------------------------------------

const photoIdParams = {
  type: 'object',
  required: ['franchise', 'slug', 'photoId'],
  additionalProperties: false,
  properties: {
    franchise: { type: 'string', minLength: 1, maxLength: 120 },
    slug: { type: 'string', minLength: 1, maxLength: 120 },
    photoId: { type: 'string', format: 'uuid' },
  },
} as const;

// ---------------------------------------------------------------------------
// Write response (includes status for curator feedback)
// ---------------------------------------------------------------------------

const photoWriteItem = {
  type: 'object',
  required: ['id', 'url', 'caption', 'is_primary', 'sort_order', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    caption: { type: ['string', 'null'] },
    is_primary: { type: 'boolean' },
    sort_order: { type: 'integer' },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Duplicate detection response
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

export const uploadPhotosSchema = {
  description: 'Upload one or more photos for a catalog item. Requires curator role.',
  tags: ['catalog-photos'],
  summary: 'Upload photos',
  params: franchiseSlugParams,
  consumes: ['multipart/form-data'],
  response: {
    201: {
      type: 'object',
      required: ['photos'],
      additionalProperties: false,
      properties: {
        photos: { type: 'array', items: photoWriteItem },
      },
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: duplicatePhotoError,
    413: errorResponse,
    500: errorResponse,
  },
} as const;

export const deletePhotoSchema = {
  description: 'Delete a photo from a catalog item. Requires curator role.',
  tags: ['catalog-photos'],
  summary: 'Delete photo',
  params: photoIdParams,
  response: {
    204: { type: 'null', description: 'Photo deleted' },
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const setPrimarySchema = {
  description: 'Set a photo as the primary photo for a catalog item. Requires curator role.',
  tags: ['catalog-photos'],
  summary: 'Set primary photo',
  params: photoIdParams,
  response: {
    200: {
      type: 'object',
      required: ['photo'],
      additionalProperties: false,
      properties: { photo: photoWriteItem },
    },
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
} as const;

export const reorderPhotosSchema = {
  description: 'Reorder photos for a catalog item. Requires curator role.',
  tags: ['catalog-photos'],
  summary: 'Reorder photos',
  params: franchiseSlugParams,
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
        photos: { type: 'array', items: photoWriteItem },
      },
    },
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
