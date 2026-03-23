import { useQuery } from '@tanstack/react-query';
import { getCollectionStats } from '@/collection/api';

export function useCollectionStats() {
  return useQuery({
    queryKey: ['collection', 'stats'],
    queryFn: getCollectionStats,
    staleTime: 60_000,
  });
}
