import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCollectionItems, type CollectionFilters } from '@/collection/api';

export function useCollectionItems(filters?: CollectionFilters) {
  return useQuery({
    queryKey: ['collection', 'items', filters ?? {}],
    queryFn: () => listCollectionItems(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
