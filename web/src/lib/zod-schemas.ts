import { z } from 'zod';

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  role: z.enum(['user', 'curator', 'admin']),
});

// Web clients receive refresh_token: null (token is in httpOnly cookie)
export const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
  user: UserResponseSchema,
});

// Web clients receive refresh_token: null on refresh too
export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
});

export const LinkAccountResponseSchema = UserResponseSchema.extend({
  linked_accounts: z.array(
    z.object({
      provider: z.enum(['apple', 'google']),
      email: z.string().nullable(),
    })
  ),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
});

// Admin API schemas
export const AdminUserRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.enum(['user', 'curator', 'admin']),
  deactivated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});

export const AdminUsersListSchema = z.object({
  data: z.array(AdminUserRowSchema),
  total_count: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type LinkAccountResponse = z.infer<typeof LinkAccountResponseSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;
export type AdminUsersList = z.infer<typeof AdminUsersListSchema>;
export type UserRole = AdminUserRow['role'];

// ---------------------------------------------------------------------------
// Catalog API schemas
// ---------------------------------------------------------------------------

const SlugNameRefSchema = z.object({ slug: z.string(), name: z.string() });
const NullableSlugNameRefSchema = SlugNameRefSchema.nullable();

// Franchise stats (GET /catalog/franchises/stats)
export const FranchiseStatsItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  sort_order: z.number().int().nullable(),
  notes: z.string().nullable(),
  item_count: z.number().int(),
  continuity_family_count: z.number().int(),
  manufacturer_count: z.number().int(),
});

export const FranchiseStatsListSchema = z.object({
  data: z.array(FranchiseStatsItemSchema),
});

// Franchise detail (GET /catalog/franchises/:slug)
export const FranchiseDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  sort_order: z.number().int().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

// Catalog item (list response)
export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  character: SlugNameRefSchema,
  manufacturer: NullableSlugNameRefSchema,
  toy_line: SlugNameRefSchema,
  size_class: z.string().nullable(),
  year_released: z.number().int().nullable(),
  is_third_party: z.boolean(),
  data_quality: z.enum(['needs_review', 'verified', 'community_verified']),
});

export const CatalogItemListSchema = z.object({
  data: z.array(CatalogItemSchema),
  next_cursor: z.string().nullable(),
  total_count: z.number().int(),
});

// Catalog item detail (GET /catalog/franchises/:franchise/items/:slug)
export const CatalogItemDetailSchema = CatalogItemSchema.extend({
  appearance: z
    .object({
      slug: z.string(),
      name: z.string(),
      source_media: z.string().nullable(),
      source_name: z.string().nullable(),
    })
    .nullable(),
  description: z.string().nullable(),
  barcode: z.string().nullable(),
  sku: z.string().nullable(),
  product_code: z.string().nullable(),
  photos: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      caption: z.string().nullable(),
      is_primary: z.boolean(),
    })
  ),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

// Facet counts (GET /catalog/franchises/:franchise/items/facets)
export const FacetValueSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int(),
});

export const ItemFacetsSchema = z.object({
  manufacturers: z.array(FacetValueSchema),
  size_classes: z.array(FacetValueSchema),
  toy_lines: z.array(FacetValueSchema),
  continuity_families: z.array(FacetValueSchema),
  is_third_party: z.array(FacetValueSchema),
});

// Continuity family (GET /catalog/franchises/:franchise/continuity-families)
export const ContinuityFamilySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  sort_order: z.number().int().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export const ContinuityFamilyListSchema = z.object({
  data: z.array(ContinuityFamilySchema),
});

// Manufacturer detail (GET /catalog/manufacturers/:slug)
export const ManufacturerDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  is_official_licensee: z.boolean(),
  country: z.string().nullable(),
  website_url: z.string().nullable(),
  aliases: z.array(z.string()),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Manufacturer stats (GET /catalog/manufacturers/stats)
export const ManufacturerStatsItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  is_official_licensee: z.boolean(),
  country: z.string().nullable(),
  item_count: z.number().int(),
  toy_line_count: z.number().int(),
  franchise_count: z.number().int(),
});

export const ManufacturerStatsListSchema = z.object({
  data: z.array(ManufacturerStatsItemSchema),
});

// Manufacturer-scoped facets (GET /catalog/manufacturers/:slug/items/facets)
// Has franchises[] instead of manufacturers[] (scope is already manufacturer)
export const ManufacturerItemFacetsSchema = z.object({
  franchises: z.array(FacetValueSchema),
  size_classes: z.array(FacetValueSchema),
  toy_lines: z.array(FacetValueSchema),
  continuity_families: z.array(FacetValueSchema),
  is_third_party: z.array(FacetValueSchema),
});

// Catalog search (GET /catalog/search)
export const SearchCharacterResultSchema = z.object({
  entity_type: z.literal('character'),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  character: z.null(),
  manufacturer: z.null(),
  toy_line: z.null(),
  size_class: z.null(),
  year_released: z.null(),
  is_third_party: z.null(),
  data_quality: z.null(),
});

export const SearchItemResultSchema = CatalogItemSchema.extend({
  entity_type: z.literal('item'),
});

export const SearchResultSchema = z.discriminatedUnion('entity_type', [
  SearchCharacterResultSchema,
  SearchItemResultSchema,
]);

export const CatalogSearchResponseSchema = z.object({
  data: z.array(SearchResultSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total_count: z.number().int(),
});

// Character detail (GET /catalog/franchises/:franchise/characters/:slug)
export const CharacterAppearanceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  source_media: z.string().nullable(),
  source_name: z.string().nullable(),
  year_start: z.number().int().nullable(),
  year_end: z.number().int().nullable(),
  description: z.string().nullable(),
});

export const ComponentCharacterRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
  combiner_role: z.string().nullable(),
  alt_mode: z.string().nullable(),
});

export const CharacterDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  faction: NullableSlugNameRefSchema,
  continuity_family: SlugNameRefSchema,
  character_type: z.string().nullable(),
  alt_mode: z.string().nullable(),
  is_combined_form: z.boolean(),
  combiner_role: z.string().nullable(),
  combined_form: NullableSlugNameRefSchema,
  component_characters: z.array(ComponentCharacterRefSchema),
  sub_groups: z.array(SlugNameRefSchema),
  appearances: z.array(CharacterAppearanceSchema),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

// Catalog types
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;
export type ComponentCharacterRef = z.infer<typeof ComponentCharacterRefSchema>;
export type CharacterDetail = z.infer<typeof CharacterDetailSchema>;
export type SearchCharacterResult = z.infer<typeof SearchCharacterResultSchema>;
export type SearchItemResult = z.infer<typeof SearchItemResultSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;
export type FranchiseStatsItem = z.infer<typeof FranchiseStatsItemSchema>;
export type FranchiseStatsList = z.infer<typeof FranchiseStatsListSchema>;
export type FranchiseDetail = z.infer<typeof FranchiseDetailSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
export type CatalogItemList = z.infer<typeof CatalogItemListSchema>;
export type CatalogItemDetail = z.infer<typeof CatalogItemDetailSchema>;
export type FacetValue = z.infer<typeof FacetValueSchema>;
export type ItemFacets = z.infer<typeof ItemFacetsSchema>;
export type ContinuityFamily = z.infer<typeof ContinuityFamilySchema>;
export type ContinuityFamilyList = z.infer<typeof ContinuityFamilyListSchema>;
export type ManufacturerDetail = z.infer<typeof ManufacturerDetailSchema>;
export type ManufacturerStatsItem = z.infer<typeof ManufacturerStatsItemSchema>;
export type ManufacturerStatsList = z.infer<typeof ManufacturerStatsListSchema>;
export type ManufacturerItemFacets = z.infer<typeof ManufacturerItemFacetsSchema>;
