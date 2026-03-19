import { apiFetchJson } from '@/lib/api-client';
import {
  FranchiseStatsListSchema,
  FranchiseDetailSchema,
  CatalogItemListSchema,
  CatalogItemDetailSchema,
  ItemFacetsSchema,
  ContinuityFamilyListSchema,
  type FranchiseStatsList,
  type FranchiseDetail,
  type CatalogItemList,
  type CatalogItemDetail,
  type ItemFacets,
  type ContinuityFamilyList,
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

function buildFilterParams(filters?: ItemFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters?.manufacturer) params.set('manufacturer', filters.manufacturer);
  if (filters?.size_class) params.set('size_class', filters.size_class);
  if (filters?.toy_line) params.set('toy_line', filters.toy_line);
  if (filters?.continuity_family) params.set('continuity_family', filters.continuity_family);
  if (filters?.is_third_party !== undefined) params.set('is_third_party', String(filters.is_third_party));
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
