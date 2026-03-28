import { apiFetchJson, apiFetch, throwApiError } from '@/lib/api-client';
import {
  CollectionItemListSchema,
  CollectionItemSchema,
  CollectionStatsSchema,
  CollectionCheckResponseSchema,
  CollectionImportResponseSchema,
  type CollectionItemList,
  type CollectionItem,
  type CollectionStats,
  type CollectionCheckResponse,
  type PackageCondition,
  type CollectionExportPayload,
  type CollectionImportResponse,
  type ImportMode,
} from '@/lib/zod-schemas';

export interface CollectionFilters {
  franchise?: string;
  package_condition?: PackageCondition;
  item_condition_min?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listCollectionItems(filters?: CollectionFilters): Promise<CollectionItemList> {
  const params = new URLSearchParams();
  if (filters?.franchise) params.set('franchise', filters.franchise);
  if (filters?.package_condition) params.set('package_condition', filters.package_condition);
  if (filters?.item_condition_min !== undefined) params.set('item_condition_min', String(filters.item_condition_min));
  if (filters?.search) params.set('search', filters.search);
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

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
  package_condition?: PackageCondition;
  item_condition?: number;
  notes?: string;
}): Promise<CollectionItem> {
  return apiFetchJson('/collection', CollectionItemSchema, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchCollectionItem(
  id: string,
  body: { package_condition?: PackageCondition; item_condition?: number; notes?: string | null }
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

export async function exportCollection(includeDeleted = false): Promise<Response> {
  const qs = includeDeleted ? '?include_deleted=true' : '';
  const response = await apiFetch(`/collection/export${qs}`);
  if (!response.ok) await throwApiError(response);
  return response;
}

export async function importCollection(
  data: CollectionExportPayload,
  mode: ImportMode = 'append'
): Promise<CollectionImportResponse> {
  // Strip fields the import endpoint doesn't accept (exported_at, deleted_at on items)
  // to avoid Fastify's additionalProperties:false rejecting the request
  const payload = {
    version: data.version,
    mode,
    items: data.items.map((item) => {
      const entry: Record<string, unknown> = {
        franchise_slug: item.franchise_slug,
        item_slug: item.item_slug,
        package_condition: item.package_condition,
        item_condition: item.item_condition,
      };
      if (item.notes != null) entry.notes = item.notes;
      if (item.added_at) entry.added_at = item.added_at;
      return entry;
    }),
  };
  return apiFetchJson('/collection/import', CollectionImportResponseSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
