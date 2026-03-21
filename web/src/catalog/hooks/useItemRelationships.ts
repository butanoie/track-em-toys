import { useQuery } from '@tanstack/react-query';
import { getItemRelationships } from '@/catalog/api';
import type { ItemRelationshipsResponse } from '@/lib/zod-schemas';

export function useItemRelationships(franchise: string, slug: string | undefined) {
  return useQuery<ItemRelationshipsResponse>({
    queryKey: ['catalog', 'items', franchise, slug, 'relationships'],
    queryFn: () => getItemRelationships(franchise, slug!),
    enabled: slug !== undefined && franchise !== '',
    staleTime: 60_000,
  });
}
