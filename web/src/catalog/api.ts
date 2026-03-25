import { apiFetchJson } from '@/lib/api-client';
import {
  FranchiseStatsListSchema,
  FranchiseDetailSchema,
  CatalogItemListSchema,
  CatalogItemDetailSchema,
  ItemFacetsSchema,
  ContinuityFamilyListSchema,
  CharacterDetailSchema,
  CharacterRelationshipsResponseSchema,
  CharacterListSchema,
  CharacterFacetsSchema,
  ManufacturerDetailSchema,
  ManufacturerStatsListSchema,
  ManufacturerItemFacetsSchema,
  ItemRelationshipsResponseSchema,
  CatalogSearchResponseSchema,
  MlExportResponseSchema,
  type FranchiseStatsList,
  type FranchiseDetail,
  type CatalogItemList,
  type CatalogItemDetail,
  type ItemFacets,
  type ContinuityFamilyList,
  type CharacterDetail,
  type CharacterRelationshipsResponse,
  type CharacterList,
  type CharacterFacets,
  type ManufacturerDetail,
  type ManufacturerStatsList,
  type ManufacturerItemFacets,
  type ItemRelationshipsResponse,
  type CatalogSearchResponse,
  type MlExportResponse,
} from '@/lib/zod-schemas';

interface BaseItemFilters {
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
}

export interface ItemFilters extends BaseItemFilters {
  manufacturer?: string;
  character?: string;
}

export interface ListItemsParams {
  franchise: string;
  filters?: ItemFilters;
  page?: number;
  limit?: number;
}

function buildFilterParams(filters?: ItemFilters | ManufacturerItemFilters | CharacterFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (!filters) return params;
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params;
}

export async function listFranchiseStats(): Promise<FranchiseStatsList> {
  return apiFetchJson('/catalog/franchises/stats', FranchiseStatsListSchema);
}

export async function getFranchiseDetail(slug: string): Promise<FranchiseDetail> {
  return apiFetchJson(`/catalog/franchises/${encodeURIComponent(slug)}`, FranchiseDetailSchema);
}

export async function listCatalogItems(params: ListItemsParams): Promise<CatalogItemList> {
  const searchParams = buildFilterParams(params.filters);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const url = `/catalog/franchises/${encodeURIComponent(params.franchise)}/items${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, CatalogItemListSchema);
}

export async function getCatalogItemDetail(franchise: string, slug: string): Promise<CatalogItemDetail> {
  return apiFetchJson(
    `/catalog/franchises/${encodeURIComponent(franchise)}/items/${encodeURIComponent(slug)}`,
    CatalogItemDetailSchema
  );
}

export async function getCharacterDetail(franchise: string, slug: string): Promise<CharacterDetail> {
  return apiFetchJson(
    `/catalog/franchises/${encodeURIComponent(franchise)}/characters/${encodeURIComponent(slug)}`,
    CharacterDetailSchema
  );
}

export async function getCharacterRelationships(
  franchise: string,
  slug: string
): Promise<CharacterRelationshipsResponse> {
  return apiFetchJson(
    `/catalog/franchises/${encodeURIComponent(franchise)}/characters/${encodeURIComponent(slug)}/relationships`,
    CharacterRelationshipsResponseSchema
  );
}

export async function getItemRelationships(franchise: string, slug: string): Promise<ItemRelationshipsResponse> {
  return apiFetchJson(
    `/catalog/franchises/${encodeURIComponent(franchise)}/items/${encodeURIComponent(slug)}/relationships`,
    ItemRelationshipsResponseSchema
  );
}

// ---------------------------------------------------------------------------
// Character browsing
// ---------------------------------------------------------------------------

export interface CharacterFilters {
  continuity_family?: string;
  faction?: string;
  character_type?: string;
  sub_group?: string;
}

export interface ListCharactersParams {
  franchise: string;
  filters?: CharacterFilters;
  page?: number;
  limit?: number;
}

export async function listCharacters(params: ListCharactersParams): Promise<CharacterList> {
  const searchParams = buildFilterParams(params.filters);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const url = `/catalog/franchises/${encodeURIComponent(params.franchise)}/characters${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, CharacterListSchema);
}

export async function getCharacterFacets(franchise: string, filters?: CharacterFilters): Promise<CharacterFacets> {
  const searchParams = buildFilterParams(filters);
  const qs = searchParams.toString();
  const url = `/catalog/franchises/${encodeURIComponent(franchise)}/characters/facets${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, CharacterFacetsSchema);
}

export async function getItemFacets(franchise: string, filters?: ItemFilters): Promise<ItemFacets> {
  const searchParams = buildFilterParams(filters);
  const qs = searchParams.toString();
  const url = `/catalog/franchises/${encodeURIComponent(franchise)}/items/facets${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, ItemFacetsSchema);
}

export async function listContinuityFamilies(franchise: string): Promise<ContinuityFamilyList> {
  return apiFetchJson(
    `/catalog/franchises/${encodeURIComponent(franchise)}/continuity-families`,
    ContinuityFamilyListSchema
  );
}

// ---------------------------------------------------------------------------
// Catalog search
// ---------------------------------------------------------------------------

export interface SearchParams {
  q: string;
  franchise?: string;
  type?: 'character' | 'item';
  page?: number;
  limit?: number;
}

export async function searchCatalog(params: SearchParams): Promise<CatalogSearchResponse> {
  const sp = new URLSearchParams({ q: params.q });
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.franchise) sp.set('franchise', params.franchise);
  if (params.type) sp.set('type', params.type);
  return apiFetchJson(`/catalog/search?${sp.toString()}`, CatalogSearchResponseSchema);
}

// ---------------------------------------------------------------------------
// Manufacturer-scoped API
// ---------------------------------------------------------------------------

export interface ManufacturerItemFilters extends BaseItemFilters {
  franchise?: string;
}

export interface ListManufacturerItemsParams {
  manufacturer: string;
  filters?: ManufacturerItemFilters;
  page?: number;
  limit?: number;
}

export async function listManufacturerStats(): Promise<ManufacturerStatsList> {
  return apiFetchJson('/catalog/manufacturers/stats', ManufacturerStatsListSchema);
}

export async function getManufacturerDetail(slug: string): Promise<ManufacturerDetail> {
  return apiFetchJson(`/catalog/manufacturers/${encodeURIComponent(slug)}`, ManufacturerDetailSchema);
}

export async function listManufacturerItems(params: ListManufacturerItemsParams): Promise<CatalogItemList> {
  const searchParams = buildFilterParams(params.filters);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const url = `/catalog/manufacturers/${encodeURIComponent(params.manufacturer)}/items${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, CatalogItemListSchema);
}

export async function getManufacturerItemFacets(
  manufacturer: string,
  filters?: ManufacturerItemFilters
): Promise<ManufacturerItemFacets> {
  const searchParams = buildFilterParams(filters);
  const qs = searchParams.toString();
  const url = `/catalog/manufacturers/${encodeURIComponent(manufacturer)}/items/facets${qs ? `?${qs}` : ''}`;
  return apiFetchJson(url, ManufacturerItemFacetsSchema);
}

// ---------------------------------------------------------------------------
// ML Export
// ---------------------------------------------------------------------------

export interface MlExportParams {
  q?: string;
  franchise?: string;
  filters?: ItemFilters;
}

export async function exportForMl(params: MlExportParams): Promise<MlExportResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.franchise) sp.set('franchise', params.franchise);
  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value !== undefined && value !== '') sp.set(key, String(value));
    }
  }
  return apiFetchJson(`/catalog/ml-export?${sp.toString()}`, MlExportResponseSchema, { method: 'POST' });
}
