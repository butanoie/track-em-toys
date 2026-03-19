import { useQuery } from '@tanstack/react-query';
import { listFranchiseStats } from '@/catalog/api';
import type { FranchiseStatsList } from '@/lib/zod-schemas';

export function useFranchises() {
  return useQuery<FranchiseStatsList>({
    queryKey: ['catalog', 'franchises', 'stats'],
    queryFn: () => listFranchiseStats(),
    staleTime: 5 * 60_000,
  });
}
