import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCatalogItems, type ItemFilters } from '@/catalog/api';
import type { CatalogItemList } from '@/lib/zod-schemas';

export function useItems(franchise: string, filters?: ItemFilters, page?: number, limit?: number) {
  return useQuery<CatalogItemList>({
    queryKey: ['catalog', 'items', franchise, filters ?? {}, page ?? 1, limit ?? 20],
    queryFn: () => listCatalogItems({ franchise, filters, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
