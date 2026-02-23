export const signinSchema = {
  body: {
    type: 'object',
    required: ['provider', 'id_token'],
    properties: {
      provider: { type: 'string', enum: ['apple', 'google'] },
      id_token: { type: 'string', minLength: 1, maxLength: 8192 },
      nonce: { type: 'string', minLength: 1, maxLength: 256 },
      user_info: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: ['string', 'null'] },
            display_name: { type: ['string', 'null'] },
            avatar_url: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
} as const

export const refreshSchema = {
  body: {
    type: 'object',
    properties: {
      refresh_token: { type: 'string', minLength: 1, maxLength: 256 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
      },
    },
  },
} as const

export const logoutSchema = {
  body: {
    type: 'object',
    properties: {
      refresh_token: { type: 'string', minLength: 1, maxLength: 256 },
    },
    additionalProperties: false,
  },
} as const

export const linkAccountSchema = {
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
      properties: {
        id: { type: 'string' },
        email: { type: ['string', 'null'] },
        display_name: { type: ['string', 'null'] },
        avatar_url: { type: ['string', 'null'] },
        linked_accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              email: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
} as const
