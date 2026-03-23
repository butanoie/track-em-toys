import { apiFetchJson, apiFetch, throwApiError } from '@/lib/api-client';
import {
  CollectionItemListSchema,
  CollectionItemSchema,
  CollectionStatsSchema,
  CollectionCheckResponseSchema,
  type CollectionItemList,
  type CollectionItem,
  type CollectionStats,
  type CollectionCheckResponse,
  type CollectionCondition,
} from '@/lib/zod-schemas';

export interface CollectionFilters {
  franchise?: string;
  condition?: CollectionCondition;
  search?: string;
  cursor?: string;
}

export async function listCollectionItems(filters?: CollectionFilters): Promise<CollectionItemList> {
  const params = new URLSearchParams();
  if (filters?.franchise) params.set('franchise', filters.franchise);
  if (filters?.condition) params.set('condition', filters.condition);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.cursor) params.set('cursor', filters.cursor);

  const qs = params.toString();
  return apiFetchJson(`/collection${qs ? `?${qs}` : ''}`, CollectionItemListSchema);
}

export async function getCollectionStats(): Promise<CollectionStats> {
  return apiFetchJson('/collection/stats', CollectionStatsSchema);
}

export async function checkCollectionItems(itemIds: string[]): Promise<CollectionCheckResponse> {
  const params = new URLSearchParams();
  params.set('itemIds', itemIds.join(','));
  return apiFetchJson(`/collection/check?${params.toString()}`, CollectionCheckResponseSchema);
}

export async function addCollectionItem(body: {
  item_id: string;
  condition?: CollectionCondition;
  notes?: string;
}): Promise<CollectionItem> {
  return apiFetchJson('/collection', CollectionItemSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchCollectionItem(
  id: string,
  body: { condition?: CollectionCondition; notes?: string | null }
): Promise<CollectionItem> {
  return apiFetchJson(`/collection/${encodeURIComponent(id)}`, CollectionItemSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCollectionItem(id: string): Promise<void> {
  const response = await apiFetch(`/collection/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) await throwApiError(response);
}

export async function restoreCollectionItem(id: string): Promise<CollectionItem> {
  return apiFetchJson(`/collection/${encodeURIComponent(id)}/restore`, CollectionItemSchema, {
    method: 'POST',
  });
}
