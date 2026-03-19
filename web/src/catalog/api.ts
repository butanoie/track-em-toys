import { apiFetchJson } from '@/lib/api-client';
import {
  FranchiseStatsListSchema,
  FranchiseDetailSchema,
  CatalogItemListSchema,
  CatalogItemDetailSchema,
  ItemFacetsSchema,
  ContinuityFamilyListSchema,
  ManufacturerDetailSchema,
  ManufacturerStatsListSchema,
  ManufacturerItemFacetsSchema,
  type FranchiseStatsList,
  type FranchiseDetail,
  type CatalogItemList,
  type CatalogItemDetail,
  type ItemFacets,
  type ContinuityFamilyList,
  type ManufacturerDetail,
  type ManufacturerStatsList,
  type ManufacturerItemFacets,
} from '@/lib/zod-schemas';

export interface ItemFilters {
  manufacturer?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
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
// Manufacturer-scoped API
// ---------------------------------------------------------------------------

export interface ManufacturerItemFilters {
  franchise?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
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
