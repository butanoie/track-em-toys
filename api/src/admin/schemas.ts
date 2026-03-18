import { errorResponse } from '../catalog/shared/schemas.js';

/** Reusable admin user item shape for list and detail responses. */
const adminUserSchema = {
  type: 'object',
  required: ['id', 'email', 'display_name', 'avatar_url', 'role', 'deactivated_at', 'deleted_at', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    email: { type: ['string', 'null'] },
    display_name: { type: ['string', 'null'] },
    avatar_url: { type: ['string', 'null'] },
    role: { type: 'string', enum: ['user', 'curator', 'admin'] },
    deactivated_at: { type: ['string', 'null'] },
    deleted_at: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
} as const;

const uuidParam = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

/** GET /admin/users */
export const listUsersSchema = {
  description: 'List all users with optional role and email filters. Requires admin role.',
  tags: ['admin'],
  summary: 'List users',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['user', 'curator', 'admin'] },
      email: { type: 'string', maxLength: 255 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      required: ['data', 'total_count', 'limit', 'offset'],
      additionalProperties: false,
      properties: {
        data: { type: 'array', items: adminUserSchema },
        total_count: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
    401: errorResponse,
    403: errorResponse,
  },
} as const;

/** PATCH /admin/users/:id/role */
export const patchUserRoleSchema = {
  description: "Change a user's role. Cannot modify own role or assign above own level. Requires admin role.",
  tags: ['admin'],
  summary: 'Assign role',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  body: {
    type: 'object',
    required: ['role'],
    additionalProperties: false,
    properties: {
      role: { type: 'string', enum: ['user', 'curator', 'admin'] },
    },
  },
  response: {
    200: adminUserSchema,
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
} as const;

/** POST /admin/users/:id/deactivate */
export const deactivateUserSchema = {
  description: 'Deactivate a user account and revoke all their refresh tokens. Requires admin role.',
  tags: ['admin'],
  summary: 'Deactivate user',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    200: adminUserSchema,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
} as const;

/** POST /admin/users/:id/reactivate */
export const reactivateUserSchema = {
  description:
    'Reactivate a previously deactivated user account. The user must re-authenticate via OAuth. Requires admin role.',
  tags: ['admin'],
  summary: 'Reactivate user',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    200: adminUserSchema,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
} as const;

/** DELETE /admin/users/:id */
export const deleteUserSchema = {
  description:
    'GDPR-compliant user deletion: scrub PII, hard-delete auth data, preserve tombstone row. Requires admin role.',
  tags: ['admin'],
  summary: 'GDPR purge user',
  security: [{ bearerAuth: [] }],
  params: uuidParam,
  response: {
    204: { type: 'null', description: 'No Content' },
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
} as const;
