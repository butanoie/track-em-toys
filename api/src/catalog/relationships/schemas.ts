import { errorResponse, franchiseSlugParams, slugNameRef } from '../shared/schemas.js';

const characterRelationshipItem = {
  type: 'object',
  required: ['type', 'subtype', 'role', 'related_character', 'metadata'],
  additionalProperties: false,
  properties: {
    type: { type: 'string' },
    subtype: { type: ['string', 'null'] },
    role: { type: ['string', 'null'] },
    related_character: slugNameRef,
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

const itemRelationshipItem = {
  type: 'object',
  required: ['type', 'subtype', 'role', 'related_item', 'metadata'],
  additionalProperties: false,
  properties: {
    type: { type: 'string' },
    subtype: { type: ['string', 'null'] },
    role: { type: ['string', 'null'] },
    related_item: slugNameRef,
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

export const getCharacterRelationshipsSchema = {
  description: 'Get all relationships for a character (both directions).',
  tags: ['catalog'],
  summary: 'Get character relationships',
  params: franchiseSlugParams,
  response: {
    200: {
      type: 'object',
      required: ['relationships'],
      additionalProperties: false,
      properties: {
        relationships: { type: 'array', items: characterRelationshipItem },
      },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const getItemRelationshipsSchema = {
  description: 'Get all relationships for an item.',
  tags: ['catalog'],
  summary: 'Get item relationships',
  params: franchiseSlugParams,
  response: {
    200: {
      type: 'object',
      required: ['relationships'],
      additionalProperties: false,
      properties: {
        relationships: { type: 'array', items: itemRelationshipItem },
      },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const;
