import { useQuery } from '@tanstack/react-query';
import { getCatalogItemDetail } from '@/catalog/api';
import type { CatalogItemDetail } from '@/lib/zod-schemas';

export function useItemDetail(franchise: string, slug: string | undefined) {
  return useQuery<CatalogItemDetail>({
    queryKey: ['catalog', 'items', franchise, slug],
    queryFn: () => getCatalogItemDetail(franchise, slug!),
    enabled: slug !== undefined,
    staleTime: 60_000,
  });
}
