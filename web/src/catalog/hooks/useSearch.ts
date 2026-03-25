import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchCatalog } from '@/catalog/api';
import type { CatalogSearchResponse } from '@/lib/zod-schemas';

export type SearchEntityType = 'character' | 'item';

export function useSearch(q: string, page: number, franchise?: string, limit?: number, type?: SearchEntityType) {
  return useQuery<CatalogSearchResponse>({
    queryKey: ['catalog', 'search', q, page, limit ?? 20, franchise ?? null, type ?? null],
    queryFn: () => searchCatalog({ q, page, franchise, limit, type }),
    enabled: q.trim().length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
