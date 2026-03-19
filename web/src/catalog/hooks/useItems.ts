import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCatalogItems, type ItemFilters } from '@/catalog/api';
import type { CatalogItemList } from '@/lib/zod-schemas';

export function useItems(franchise: string, filters?: ItemFilters, cursor?: string) {
  return useQuery<CatalogItemList>({
    queryKey: ['catalog', 'items', franchise, filters ?? {}, cursor ?? null],
    queryFn: () => listCatalogItems({ franchise, filters, cursor }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
