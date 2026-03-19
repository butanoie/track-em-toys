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

/** Querystring schema for cursor-paginated list endpoints. */
export const paginationQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    cursor: { type: 'string', maxLength: 512 },
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

/** Shared item shape for list responses (franchise-scoped and manufacturer-scoped). */
export const itemListItem = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'franchise',
    'character',
    'manufacturer',
    'toy_line',
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
    character: slugNameRef,
    manufacturer: nullableSlugNameRef,
    toy_line: slugNameRef,
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

/**
 * Cursor-paginated list response wrapper.
 *
 * @param itemSchema - JSON Schema for array items
 */
export function cursorListResponse(itemSchema: object) {
  return {
    type: 'object',
    required: ['data', 'next_cursor', 'total_count'],
    additionalProperties: false,
    properties: {
      data: { type: 'array', items: itemSchema },
      next_cursor: { type: ['string', 'null'] },
      total_count: { type: 'integer' },
    },
  } as const;
}
