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

// Character depiction on catalog items (list-level)
const CharacterDepictionSchema = z.object({
  slug: z.string(),
  name: z.string(),
  appearance_slug: z.string(),
  is_primary: z.boolean(),
});

// Character depiction on catalog items (detail-level, includes appearance info)
const CharacterDepictionDetailSchema = z.object({
  slug: z.string(),
  name: z.string(),
  appearance_slug: z.string(),
  appearance_name: z.string(),
  appearance_source_media: z.string().nullable(),
  appearance_source_name: z.string().nullable(),
  is_primary: z.boolean(),
});

// Catalog item (list response)
export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  characters: z.array(CharacterDepictionSchema),
  manufacturer: NullableSlugNameRefSchema,
  toy_line: SlugNameRefSchema,
  thumbnail_url: z.string().nullable(),
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
  characters: z.array(CharacterDepictionDetailSchema),
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
      sort_order: z.number().int(),
    })
  ),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

// Photo read shape — extracted from CatalogItemDetailSchema for reuse
export const PhotoSchema = CatalogItemDetailSchema.shape.photos.element;

// Photo write response (POST upload, PATCH primary, PATCH reorder)
// Includes status field returned by curator-facing endpoints
export const PhotoWriteItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().nullable(),
  is_primary: z.boolean(),
  sort_order: z.number().int(),
  status: z.enum(['pending', 'approved', 'rejected']),
});

export const UploadPhotosResponseSchema = z.object({
  photos: z.array(PhotoWriteItemSchema),
});

export const SetPrimaryResponseSchema = z.object({
  photo: PhotoWriteItemSchema,
});

export const ReorderPhotosResponseSchema = z.object({
  photos: z.array(PhotoWriteItemSchema),
});

// Duplicate photo detection (409 response from upload)
export const DuplicatePhotoResponseSchema = z.object({
  error: z.string(),
  matched: z.object({ id: z.string(), url: z.string() }),
});
export type DuplicatePhotoResponse = z.infer<typeof DuplicatePhotoResponseSchema>;

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
const SearchResultBaseSchema = z.object({
  entity_type: z.string(),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  continuity_family: NullableSlugNameRefSchema,
  character: NullableSlugNameRefSchema,
  manufacturer: NullableSlugNameRefSchema,
  toy_line: NullableSlugNameRefSchema,
  thumbnail_url: z.string().nullable(),
  size_class: z.string().nullable(),
  year_released: z.number().int().nullable(),
  is_third_party: z.boolean().nullable(),
  data_quality: z.string().nullable(),
});

export const SearchCharacterResultSchema = SearchResultBaseSchema.extend({
  entity_type: z.literal('character'),
});

export const SearchItemResultSchema = SearchResultBaseSchema.extend({
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
  sub_groups: z.array(SlugNameRefSchema),
  appearances: z.array(CharacterAppearanceSchema),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

// Character list item (GET /catalog/franchises/:franchise/characters)
export const CharacterListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  franchise: SlugNameRefSchema,
  faction: NullableSlugNameRefSchema,
  continuity_family: SlugNameRefSchema,
  character_type: z.string().nullable(),
  alt_mode: z.string().nullable(),
  is_combined_form: z.boolean(),
});

export const CharacterListSchema = z.object({
  data: z.array(CharacterListItemSchema),
  next_cursor: z.string().nullable(),
  total_count: z.number().int(),
});

// Character facets (GET /catalog/franchises/:franchise/characters/facets)
export const CharacterFacetsSchema = z.object({
  factions: z.array(FacetValueSchema),
  character_types: z.array(FacetValueSchema),
  sub_groups: z.array(FacetValueSchema),
});

// ---------------------------------------------------------------------------
// Relationship schemas
// ---------------------------------------------------------------------------

export const CharacterRelationshipSchema = z.object({
  type: z.string(),
  subtype: z.string().nullable(),
  role: z.string().nullable(),
  related_character: SlugNameRefSchema,
  metadata: z.record(z.unknown()),
});

export const CharacterRelationshipsResponseSchema = z.object({
  relationships: z.array(CharacterRelationshipSchema),
});

export const ItemRelationshipSchema = z.object({
  type: z.string(),
  subtype: z.string().nullable(),
  role: z.string().nullable(),
  related_item: SlugNameRefSchema,
  metadata: z.record(z.unknown()),
});

export const ItemRelationshipsResponseSchema = z.object({
  relationships: z.array(ItemRelationshipSchema),
});

// Catalog types
export type CharacterDepiction = z.infer<typeof CharacterDepictionSchema>;
export type CharacterDepictionDetail = z.infer<typeof CharacterDepictionDetailSchema>;
export type CharacterListItem = z.infer<typeof CharacterListItemSchema>;
export type CharacterList = z.infer<typeof CharacterListSchema>;
export type CharacterFacets = z.infer<typeof CharacterFacetsSchema>;
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;
export type CharacterDetail = z.infer<typeof CharacterDetailSchema>;
export type CharacterRelationship = z.infer<typeof CharacterRelationshipSchema>;
export type CharacterRelationshipsResponse = z.infer<typeof CharacterRelationshipsResponseSchema>;
export type ItemRelationship = z.infer<typeof ItemRelationshipSchema>;
export type ItemRelationshipsResponse = z.infer<typeof ItemRelationshipsResponseSchema>;
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
export type Photo = z.infer<typeof PhotoSchema>;
export type PhotoWriteItem = z.infer<typeof PhotoWriteItemSchema>;

// ---------------------------------------------------------------------------
// ML Export
// ---------------------------------------------------------------------------

const MlExportWarningSchema = z.object({
  label: z.string(),
  photo_count: z.number().int(),
  message: z.string(),
});

const MlExportStatsSchema = z.object({
  total_photos: z.number().int(),
  items: z.number().int(),
  franchises: z.number().int(),
  low_photo_items: z.number().int(),
});

export const MlExportResponseSchema = z.object({
  exported_at: z.string(),
  filename: z.string(),
  stats: MlExportStatsSchema,
  warnings: z.array(MlExportWarningSchema),
});

export type MlExportResponse = z.infer<typeof MlExportResponseSchema>;

// ---------------------------------------------------------------------------
// Collection schemas
// ---------------------------------------------------------------------------

export const CollectionConditionSchema = z.enum([
  'mint_sealed',
  'opened_complete',
  'opened_incomplete',
  'loose_complete',
  'loose_incomplete',
  'damaged',
  'unknown',
]);

export const CollectionItemSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  item_name: z.string(),
  item_slug: z.string(),
  franchise: SlugNameRefSchema,
  manufacturer: SlugNameRefSchema.nullable(),
  toy_line: SlugNameRefSchema,
  thumbnail_url: z.string().nullable(),
  condition: CollectionConditionSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CollectionItemListSchema = z.object({
  data: z.array(CollectionItemSchema),
  next_cursor: z.string().nullable(),
  total_count: z.number().int(),
});

const CollectionFranchiseStatSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int(),
});

const CollectionConditionStatSchema = z.object({
  condition: CollectionConditionSchema,
  count: z.number().int(),
});

export const CollectionStatsSchema = z.object({
  total_copies: z.number().int(),
  unique_items: z.number().int(),
  deleted_count: z.number().int(),
  by_franchise: z.array(CollectionFranchiseStatSchema),
  by_condition: z.array(CollectionConditionStatSchema),
});

const CollectionCheckEntrySchema = z.object({
  count: z.number().int(),
  collection_ids: z.array(z.string()),
});

export const CollectionCheckResponseSchema = z.object({
  items: z.record(CollectionCheckEntrySchema),
});

// Export/import schemas

const ExportItemSchema = z.object({
  franchise_slug: z.string(),
  item_slug: z.string(),
  condition: CollectionConditionSchema,
  notes: z.string().nullable(),
  added_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const CollectionExportPayloadSchema = z.object({
  version: z.number().int().min(1),
  exported_at: z.string(),
  items: z.array(ExportItemSchema),
});

const ImportedItemSchema = z.object({
  franchise_slug: z.string(),
  item_slug: z.string(),
  item_name: z.string(),
  condition: CollectionConditionSchema,
});

const UnresolvedItemSchema = z.object({
  franchise_slug: z.string(),
  item_slug: z.string(),
  reason: z.string(),
});

export const CollectionImportResponseSchema = z.object({
  imported: z.array(ImportedItemSchema),
  unresolved: z.array(UnresolvedItemSchema),
});

// Collection types
export type CollectionCondition = z.infer<typeof CollectionConditionSchema>;
export type CollectionItem = z.infer<typeof CollectionItemSchema>;
export type CollectionItemList = z.infer<typeof CollectionItemListSchema>;
export type CollectionStats = z.infer<typeof CollectionStatsSchema>;
export type CollectionCheckEntry = z.infer<typeof CollectionCheckEntrySchema>;
export type CollectionCheckResponse = z.infer<typeof CollectionCheckResponseSchema>;
export type CollectionExportPayload = z.infer<typeof CollectionExportPayloadSchema>;
export type ImportedItem = z.infer<typeof ImportedItemSchema>;
export type UnresolvedItem = z.infer<typeof UnresolvedItemSchema>;
export type CollectionImportResponse = z.infer<typeof CollectionImportResponseSchema>;
