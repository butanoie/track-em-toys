import { errorResponse } from '../../catalog/shared/schemas.js';

/** UUID path param schema (matches admin/schemas.ts convention). */
const uuidParam = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

/** Single uploader object schema — returned as null when uploaded_by is NULL or the user is tombstoned. */
const uploaderObjectSchema = {
  type: ['object', 'null'],
  required: ['id', 'display_name', 'email'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    display_name: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
  },
} as const;

/** Contribution audit object schema — returned as null for direct curator uploads. */
const contributionObjectSchema = {
  type: ['object', 'null'],
  required: ['id', 'consent_version', 'consent_granted_at', 'intent', 'contributed_by'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    consent_version: { type: 'string' },
    consent_granted_at: { type: 'string' },
    intent: { type: 'string', enum: ['training_only', 'catalog_and_training'] },
    contributed_by: { type: 'string' },
  },
} as const;

/**
 * Existing-photo sidebar item shape (top 3 public-approved photos per item,
 * ranked by dHash similarity to the pending photo). `distance` is the Hamming
 * distance (0-64) between the pending photo's dHash and this photo's dHash,
 * or null when either side has an empty/legacy dHash.
 */
const existingPhotoItemSchema = {
  type: 'object',
  required: ['id', 'url', 'distance'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    distance: { type: ['integer', 'null'] },
  },
} as const;

/** Full pending-photo triage item shape. */
const pendingPhotoItemSchema = {
  type: 'object',
  required: ['id', 'item', 'photo', 'uploader', 'contribution', 'existing_photos', 'can_decide', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    item: {
      type: 'object',
      required: ['id', 'name', 'slug', 'franchise_slug', 'thumbnail_url'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        franchise_slug: { type: 'string' },
        thumbnail_url: { type: ['string', 'null'] },
      },
    },
    photo: {
      type: 'object',
      required: ['url', 'caption', 'visibility'],
      additionalProperties: false,
      properties: {
        url: { type: 'string' },
        caption: { type: ['string', 'null'] },
        visibility: { type: 'string', enum: ['public', 'training_only'] },
      },
    },
    uploader: uploaderObjectSchema,
    contribution: contributionObjectSchema,
    existing_photos: { type: 'array', items: existingPhotoItemSchema },
    can_decide: { type: 'boolean' },
    created_at: { type: 'string' },
  },
} as const;

/** GET /admin/photos/pending */
export const listPendingPhotosSchema = {
  description:
    'List pending photos awaiting curator review. Returns the oldest 200 with metadata, uploader, contribution audit, and sidebar context. Requires curator role.',
  tags: ['admin', 'photos'],
  summary: 'List pending photos',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      required: ['photos', 'total_count'],
      additionalProperties: false,
      properties: {
        photos: { type: 'array', items: pendingPhotoItemSchema },
        total_count: { type: 'integer' },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** PATCH /admin/photos/:id/status */
export const decidePhotoSchema = {
  description:
    'Approve, reject, or undo a pending photo decision. Atomic flip across item_photos and photo_contributions. Supports optimistic concurrency via expected_status and one-way visibility demote on approve. Returns 403 if the curator is the original contributor. Requires curator role.',
  tags: ['admin', 'photos'],
  summary: 'Decide photo',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['approved', 'rejected', 'pending'] },
      expected_status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
      visibility: { type: 'string', enum: ['training_only', 'public'] },
      rejection_reason_code: {
        type: 'string',
        enum: ['blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other'],
      },
      rejection_reason_text: { type: 'string', maxLength: 500 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: [
        'id',
        'item_id',
        'url',
        'status',
        'visibility',
        'rejection_reason_code',
        'rejection_reason_text',
        'updated_at',
      ],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        item_id: { type: 'string' },
        url: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        visibility: { type: 'string', enum: ['public', 'training_only'] },
        rejection_reason_code: {
          type: ['string', 'null'],
          enum: ['blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other', null],
        },
        rejection_reason_text: { type: ['string', 'null'] },
        updated_at: { type: 'string' },
      },
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: {
      type: 'object',
      required: ['error', 'current_status'],
      additionalProperties: false,
      properties: {
        error: { type: 'string' },
        current_status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
      },
    },
    422: errorResponse,
  },
} as const;

/** GET /admin/photos/pending-count */
export const pendingPhotoCountSchema = {
  description:
    'Returns the total number of pending photos awaiting review. Lightweight count query for the admin nav notification dot. Requires curator role.',
  tags: ['admin', 'photos'],
  summary: 'Pending photo count',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      required: ['count'],
      additionalProperties: false,
      properties: {
        count: { type: 'integer' },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;
