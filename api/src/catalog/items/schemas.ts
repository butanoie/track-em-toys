import {
  errorResponse, franchiseParam, franchiseSlugParams,
  paginationQuery, slugNameRef, nullableSlugNameRef, cursorListResponse,
} from '../shared/schemas.js'

const itemListItem = {
  type: 'object',
  required: [
    'id', 'name', 'slug', 'franchise', 'character', 'manufacturer', 'toy_line',
    'size_class', 'year_released', 'is_third_party', 'data_quality',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    character: slugNameRef,
    manufacturer: nullableSlugNameRef,
    toy_line: slugNameRef,
    size_class: { type: ['string', 'null'] },
    year_released: { type: ['integer', 'null'] },
    is_third_party: { type: 'boolean' },
    data_quality: { type: 'string', enum: ['needs_review', 'verified', 'community_verified'] },
  },
} as const

const appearanceRef = {
  type: 'object',
  required: ['slug', 'name', 'source_media', 'source_name'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    source_media: { type: ['string', 'null'] },
    source_name: { type: ['string', 'null'] },
  },
} as const

const photoItem = {
  type: 'object',
  required: ['id', 'url', 'caption', 'is_primary'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    url: { type: 'string' },
    caption: { type: ['string', 'null'] },
    is_primary: { type: 'boolean' },
  },
} as const

const itemDetail = {
  type: 'object',
  required: [
    'id', 'name', 'slug', 'franchise', 'character', 'manufacturer', 'toy_line',
    'size_class', 'year_released', 'is_third_party', 'data_quality',
    'appearance', 'description', 'barcode', 'sku', 'product_code',
    'photos', 'metadata', 'created_at', 'updated_at',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    character: slugNameRef,
    manufacturer: nullableSlugNameRef,
    toy_line: slugNameRef,
    size_class: { type: ['string', 'null'] },
    year_released: { type: ['integer', 'null'] },
    is_third_party: { type: 'boolean' },
    data_quality: { type: 'string', enum: ['needs_review', 'verified', 'community_verified'] },
    appearance: { oneOf: [appearanceRef, { type: 'null' }] },
    description: { type: ['string', 'null'] },
    barcode: { type: ['string', 'null'] },
    sku: { type: ['string', 'null'] },
    product_code: { type: ['string', 'null'] },
    photos: { type: 'array', items: photoItem },
    metadata: { type: 'object', additionalProperties: true },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const

export const listItemsSchema = {
  description: 'List items in a franchise with cursor-based pagination.',
  tags: ['catalog'],
  summary: 'List items',
  params: franchiseParam,
  querystring: paginationQuery,
  response: {
    200: cursorListResponse(itemListItem),
    400: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const

export const getItemSchema = {
  description: 'Get an item by slug within a franchise, including photos and appearance info.',
  tags: ['catalog'],
  summary: 'Get item',
  params: franchiseSlugParams,
  response: {
    200: itemDetail,
    404: errorResponse,
    500: errorResponse,
  },
} as const
