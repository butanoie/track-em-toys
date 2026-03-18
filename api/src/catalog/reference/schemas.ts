import { errorResponse, franchiseParam, franchiseSlugParams, nullableSlugNameRef } from '../shared/schemas.js'

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

const factionItem = {
  type: 'object',
  required: ['id', 'name', 'slug', 'notes', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
} as const

export const listFactionsSchema = {
  description: 'List factions in a franchise.',
  tags: ['catalog'],
  summary: 'List factions',
  params: franchiseParam,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'array', items: factionItem } },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const

export const getFactionSchema = {
  description: 'Get a faction by slug within a franchise.',
  tags: ['catalog'],
  summary: 'Get faction',
  params: franchiseSlugParams,
  response: {
    200: factionItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const

// ---------------------------------------------------------------------------
// Sub-Groups
// ---------------------------------------------------------------------------

const subGroupItem = {
  type: 'object',
  required: ['id', 'name', 'slug', 'faction', 'notes', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    faction: nullableSlugNameRef,
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
} as const

export const listSubGroupsSchema = {
  description: 'List sub-groups in a franchise.',
  tags: ['catalog'],
  summary: 'List sub-groups',
  params: franchiseParam,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'array', items: subGroupItem } },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const

export const getSubGroupSchema = {
  description: 'Get a sub-group by slug within a franchise.',
  tags: ['catalog'],
  summary: 'Get sub-group',
  params: franchiseSlugParams,
  response: {
    200: subGroupItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const

// ---------------------------------------------------------------------------
// Continuity Families
// ---------------------------------------------------------------------------

const continuityFamilyItem = {
  type: 'object',
  required: ['id', 'slug', 'name', 'sort_order', 'notes', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    sort_order: { type: ['integer', 'null'] },
    notes: { type: ['string', 'null'] },
    created_at: { type: 'string' },
  },
} as const

export const listContinuityFamiliesSchema = {
  description: 'List continuity families in a franchise.',
  tags: ['catalog'],
  summary: 'List continuity families',
  params: franchiseParam,
  response: {
    200: {
      type: 'object',
      required: ['data'],
      additionalProperties: false,
      properties: { data: { type: 'array', items: continuityFamilyItem } },
    },
    404: errorResponse,
    500: errorResponse,
  },
} as const

export const getContinuityFamilySchema = {
  description: 'Get a continuity family by slug within a franchise.',
  tags: ['catalog'],
  summary: 'Get continuity family',
  params: franchiseSlugParams,
  response: {
    200: continuityFamilyItem,
    404: errorResponse,
    500: errorResponse,
  },
} as const
