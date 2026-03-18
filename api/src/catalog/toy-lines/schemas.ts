import { errorResponse, franchiseParam, franchiseSlugParams, slugNameRef } from '../shared/schemas.js';

const toyLineItem = {
  type: 'object',
  required: ['id', 'name', 'slug', 'franchise', 'manufacturer', 'scale', 'description', 'created_at', 'updated_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    manufacturer: slugNameRef,
    scale: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const;

export const listToyLinesSchema = {
  description: 'List toy lines in a franchise.',
  tags: ['catalog'],
  summary: 'List toy lines',
  params: franchiseParam,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'array', items: toyLineItem } },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const getToyLineSchema = {
  description: 'Get a toy line by slug within a franchise.',
  tags: ['catalog'],
  summary: 'Get toy line',
  params: franchiseSlugParams,
  response: {
    200: toyLineItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
