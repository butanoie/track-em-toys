import { useQuery } from '@tanstack/react-query';
import { checkCollectionItems } from '@/collection/api';

/**
 * Batch-check which catalog item IDs the user has in their collection.
 *
 * IMPORTANT: `itemIds` must be memoized at the call site (via useMemo)
 * to prevent TanStack Query from seeing a new key on every render.
 */
export function useCollectionCheck(itemIds: string[]) {
  return useQuery({
    queryKey: ['collection', 'check', itemIds],
    queryFn: () => checkCollectionItems(itemIds),
    enabled: itemIds.length > 0,
    staleTime: 30_000,
  });
}
