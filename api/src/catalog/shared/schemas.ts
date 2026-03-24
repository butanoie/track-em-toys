/** Reusable error response schema for a single `error` string field. */
export const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;

/** Params schema for franchise-scoped routes: { franchise: string }. */
export const franchiseParam = {
  type: 'object',
  required: ['franchise'],
  additionalProperties: false,
  properties: {
    franchise: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

/** Params schema for detail routes: { franchise: string, slug: string }. */
export const franchiseSlugParams = {
  type: 'object',
  required: ['franchise', 'slug'],
  additionalProperties: false,
  properties: {
    franchise: { type: 'string', minLength: 1, maxLength: 120 },
    slug: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

/** Params schema for unscoped detail routes: { slug: string }. */
export const slugParam = {
  type: 'object',
  required: ['slug'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

/** Shared { slug, name } reference shape used in joined responses. */
export const slugNameRef = {
  type: 'object',
  required: ['slug', 'name'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

/** Nullable slug+name reference: either the object or null. */
export const nullableSlugNameRef = {
  oneOf: [slugNameRef, { type: 'null' }],
} as const;

/** Character depiction reference for item list responses. */
export const characterDepictionListItem = {
  type: 'object',
  required: ['slug', 'name', 'appearance_slug', 'is_primary'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    appearance_slug: { type: 'string' },
    is_primary: { type: 'boolean' },
  },
} as const;

/** Shared item shape for list responses (franchise-scoped and manufacturer-scoped). */
export const itemListItem = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'franchise',
    'characters',
    'manufacturer',
    'toy_line',
    'thumbnail_url',
    'size_class',
    'year_released',
    'is_third_party',
    'data_quality',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    characters: { type: 'array', items: characterDepictionListItem },
    manufacturer: nullableSlugNameRef,
    toy_line: slugNameRef,
    thumbnail_url: { type: ['string', 'null'] },
    size_class: { type: ['string', 'null'] },
    year_released: { type: ['integer', 'null'] },
    is_third_party: { type: 'boolean' },
    data_quality: { type: 'string', enum: ['needs_review', 'verified', 'community_verified'] },
  },
} as const;

/** Shared facet value shape: { value, label, count }. */
export const facetValueItem = {
  type: 'object',
  required: ['value', 'label', 'count'],
  additionalProperties: false,
  properties: {
    value: { type: 'string' },
    label: { type: 'string' },
    count: { type: 'integer' },
  },
} as const;

/** Shared photo item shape for read and write responses. */
export const photoItem = {
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

/**
 * Page-based list response wrapper.
 *
 * @param itemSchema - JSON Schema for array items
 */
export function pageListResponse(itemSchema: object) {
  return {
    type: 'object',
    required: ['data', 'page', 'limit', 'total_count'],
    additionalProperties: false,
    properties: {
      data: { type: 'array', items: itemSchema },
      page: { type: 'integer' },
      limit: { type: 'integer' },
      total_count: { type: 'integer' },
    },
  } as const;
}
