/** Reusable error response schema for a single `error` string field. */
const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const

/** Fastify route schema for POST /auth/signin. */
export const signinSchema = {
  description: 'Authenticate with an Apple or Google identity provider. Creates a new user on first sign-in.',
  tags: ['auth'],
  summary: 'Sign in',
  body: {
    type: 'object',
    required: ['provider', 'id_token'],
    properties: {
      provider: { type: 'string', enum: ['apple', 'google'] },
      id_token: { type: 'string', minLength: 1, maxLength: 8192 },
      // nonce cannot be conditionally required by AJV based on provider field;
      // Apple nonce validation is enforced at the application layer in verifyAppleToken
      nonce: { type: 'string', minLength: 1, maxLength: 256 },
      user_info: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      required: ['access_token', 'refresh_token', 'user'],
      additionalProperties: false,
      properties: {
        access_token: { type: 'string' },
        // Web clients receive null (token is in httpOnly cookie); native clients receive the token.
        refresh_token: { type: ['string', 'null'] },
        user: {
          type: 'object',
          required: ['id', 'email', 'display_name', 'avatar_url'],
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            email: { type: ['string', 'null'] },
            display_name: { type: ['string', 'null'] },
            avatar_url: { type: ['string', 'null'] },
          },
        },
      },
    },
    // 400: schema validation failure (e.g. missing required fields)
    400: errorResponse,
    // 401: invalid or missing provider token
    401: errorResponse,
    // 403: account deactivated
    403: errorResponse,
    // 415: wrong Content-Type
    415: errorResponse,
    // 500: unexpected server error
    500: errorResponse,
    // 503: authentication service unavailable (JWKS fetch failure etc.)
    503: errorResponse,
  },
} as const

/**
 * Fastify route schema for POST /auth/refresh.
 *
 * No `required` array on the body: web clients send the refresh token via the
 * httpOnly cookie; native clients include it in the request body.
 */
export const refreshSchema = {
  description: 'Rotate a refresh token and receive a new access token. Web clients send the refresh token via httpOnly cookie; native clients send it in the request body.',
  tags: ['auth'],
  summary: 'Refresh tokens',
  body: {
    type: 'object',
    // NOTE: No `required` array — body fields are intentionally optional.
    // Web clients send the refresh token via signed cookie; native clients
    // send it in the body. Both paths are valid; Fastify must accept either.
    properties: {
      refresh_token: { type: 'string', minLength: 1, maxLength: 256 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      required: ['access_token', 'refresh_token'],
      additionalProperties: false,
      properties: {
        access_token: { type: 'string' },
        // Web clients receive null (token is in httpOnly cookie); native clients receive the token.
        refresh_token: { type: ['string', 'null'] },
      },
    },
    // 400: schema validation failure (e.g. non-object body or wrong field type)
    400: errorResponse,
    // 401: missing token (not in body or cookie), invalid, tampered, or expired token; token reuse detected
    401: errorResponse,
    // 403: account deactivated or not found
    403: errorResponse,
    // 415: wrong Content-Type
    415: errorResponse,
    // 500: unexpected server error
    500: errorResponse,
  },
} as const

/**
 * Fastify route schema for POST /auth/logout.
 *
 * No `required` array on the body: web clients send the refresh token via the
 * httpOnly cookie; native clients include it in the request body.
 */
export const logoutSchema = {
  description: 'Revoke the current refresh token and clear the session. Requires a valid access token.',
  tags: ['auth'],
  summary: 'Log out',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    // refresh_token is optional in the request body: web clients send it via
    // httpOnly cookie; native clients include it in the request body.
    properties: {
      refresh_token: { type: 'string', minLength: 1, maxLength: 256 },
    },
    additionalProperties: false,
  },
  response: {
    204: { type: 'null', description: 'No Content' },
    // 400: schema validation failure (e.g. wrong field type)
    400: errorResponse,
    // 401: JWT missing/invalid, tampered cookie HMAC, or missing refresh token
    401: errorResponse,
    // 403: token belongs to a different user
    403: errorResponse,
    // 415: wrong Content-Type
    415: errorResponse,
    // 500: unexpected server error
    500: errorResponse,
  },
} as const

/** Fastify route schema for POST /auth/link-account. */
export const linkAccountSchema = {
  description: 'Link an additional OAuth provider to the authenticated user account. Requires a valid access token.',
  tags: ['auth'],
  summary: 'Link account',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['provider', 'id_token'],
    properties: {
      provider: { type: 'string', enum: ['apple', 'google'] },
      id_token: { type: 'string', minLength: 1, maxLength: 8192 },
      nonce: { type: 'string', minLength: 1, maxLength: 256 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      required: ['id', 'email', 'display_name', 'avatar_url', 'linked_accounts'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        email: { type: ['string', 'null'] },
        display_name: { type: ['string', 'null'] },
        avatar_url: { type: ['string', 'null'] },
        linked_accounts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'email'],
            properties: {
              provider: { type: 'string' },
              email: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    // 400: schema validation failure
    400: errorResponse,
    // 401: JWT missing/invalid, or invalid provider token
    401: errorResponse,
    // 409: provider account already linked to this or another user
    409: errorResponse,
    // 415: wrong Content-Type
    415: errorResponse,
    // 500: unexpected server error
    500: errorResponse,
    // 503: authentication service unavailable (JWKS fetch failure etc.)
    503: errorResponse,
  },
} as const
