import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getItemFacets, type ItemFilters } from '@/catalog/api';
import type { ItemFacets } from '@/lib/zod-schemas';

export function useItemFacets(franchise: string, filters?: ItemFilters) {
  return useQuery<ItemFacets>({
    queryKey: ['catalog', 'items', franchise, 'facets', filters ?? {}],
    queryFn: () => getItemFacets(franchise, filters),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
}
