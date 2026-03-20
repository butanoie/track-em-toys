import {
  errorResponse,
  franchiseParam,
  franchiseSlugParams,
  slugNameRef,
  nullableSlugNameRef,
  cursorListResponse,
  facetValueItem,
} from '../shared/schemas.js';

const characterListItem = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'franchise',
    'faction',
    'continuity_family',
    'character_type',
    'alt_mode',
    'is_combined_form',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    faction: nullableSlugNameRef,
    continuity_family: slugNameRef,
    character_type: { type: ['string', 'null'] },
    alt_mode: { type: ['string', 'null'] },
    is_combined_form: { type: 'boolean' },
  },
} as const;

const appearanceItem = {
  type: 'object',
  required: ['id', 'slug', 'name', 'source_media', 'source_name', 'year_start', 'year_end', 'description'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    source_media: { type: ['string', 'null'] },
    source_name: { type: ['string', 'null'] },
    year_start: { type: ['integer', 'null'] },
    year_end: { type: ['integer', 'null'] },
    description: { type: ['string', 'null'] },
  },
} as const;

const componentCharacterItem = {
  type: 'object',
  required: ['slug', 'name', 'combiner_role', 'alt_mode'],
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    combiner_role: { type: ['string', 'null'] },
    alt_mode: { type: ['string', 'null'] },
  },
} as const;

const characterDetail = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'franchise',
    'faction',
    'continuity_family',
    'character_type',
    'alt_mode',
    'is_combined_form',
    'combiner_role',
    'combined_form',
    'component_characters',
    'sub_groups',
    'appearances',
    'metadata',
    'created_at',
    'updated_at',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    franchise: slugNameRef,
    faction: nullableSlugNameRef,
    continuity_family: slugNameRef,
    character_type: { type: ['string', 'null'] },
    alt_mode: { type: ['string', 'null'] },
    is_combined_form: { type: 'boolean' },
    combiner_role: { type: ['string', 'null'] },
    combined_form: nullableSlugNameRef,
    component_characters: { type: 'array', items: componentCharacterItem },
    sub_groups: { type: 'array', items: slugNameRef },
    appearances: { type: 'array', items: appearanceItem },
    metadata: { type: 'object', additionalProperties: true },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
} as const;

/** Querystring for character list: pagination + filter fields. */
const characterListQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    cursor: { type: 'string', maxLength: 512 },
    continuity_family: { type: 'string', minLength: 1, maxLength: 120 },
    faction: { type: 'string', minLength: 1, maxLength: 120 },
    character_type: { type: 'string', minLength: 1, maxLength: 120 },
    sub_group: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

/** Querystring for character facets: filter fields only (no pagination). */
const characterFiltersQuerystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    continuity_family: { type: 'string', minLength: 1, maxLength: 120 },
    faction: { type: 'string', minLength: 1, maxLength: 120 },
    character_type: { type: 'string', minLength: 1, maxLength: 120 },
    sub_group: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;

export const listCharactersSchema = {
  description: 'List characters in a franchise with cursor-based pagination and optional filters.',
  tags: ['catalog'],
  summary: 'List characters',
  params: franchiseParam,
  querystring: characterListQuerystring,
  response: {
    200: cursorListResponse(characterListItem),
    400: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
} as const;

export const getCharacterFacetsSchema = {
  description: 'Get facet counts for characters in a franchise, with cross-filtering.',
  tags: ['catalog'],
  summary: 'Get character facets',
  params: franchiseParam,
  querystring: characterFiltersQuerystring,
  response: {
    200: {
      type: 'object',
      required: ['factions', 'character_types', 'sub_groups'],
      additionalProperties: false,
      properties: {
        factions: { type: 'array', items: facetValueItem },
        character_types: { type: 'array', items: facetValueItem },
        sub_groups: { type: 'array', items: facetValueItem },
      },
    },
    500: errorResponse,
  },
} as const;

export const getCharacterSchema = {
  description: 'Get a character by slug within a franchise, including sub-groups, appearances, and combiner info.',
  tags: ['catalog'],
  summary: 'Get character',
  params: franchiseSlugParams,
  response: {
    200: characterDetail,
    404: errorResponse,
    500: errorResponse,
  },
} as const;
