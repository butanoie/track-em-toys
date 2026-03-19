import { apiFetchJson } from '@/lib/api-client';
import {
  FranchiseStatsListSchema,
  FranchiseDetailSchema,
  CatalogItemListSchema,
  CatalogItemDetailSchema,
  ItemFacetsSchema,
  ContinuityFamilyListSchema,
  CharacterDetailSchema,
  ManufacturerDetailSchema,
  ManufacturerStatsListSchema,
  ManufacturerItemFacetsSchema,
  CatalogSearchResponseSchema,
  type FranchiseStatsList,
  type FranchiseDetail,
  type CatalogItemList,
  type CatalogItemDetail,
  type ItemFacets,
  type ContinuityFamilyList,
  type CharacterDetail,
  type ManufacturerDetail,
  type ManufacturerStatsList,
  type ManufacturerItemFacets,
  type CatalogSearchResponse,
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
  cursor?: string;
  limit?: number;
}

function buildFilterParams(filters?: ItemFilters | ManufacturerItemFilters): URLSearchParams {
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
  if (params.cursor) searchParams.set('cursor', params.cursor);
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
  page?: number;
  limit?: number;
}

export async function searchCatalog(params: SearchParams): Promise<CatalogSearchResponse> {
  const sp = new URLSearchParams({ q: params.q });
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.franchise) sp.set('franchise', params.franchise);
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
  cursor?: string;
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
  if (params.cursor) searchParams.set('cursor', params.cursor);
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
