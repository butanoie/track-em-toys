import { useQuery } from '@tanstack/react-query';
import { getFranchiseDetail } from '@/catalog/api';
import type { FranchiseDetail } from '@/lib/zod-schemas';

export function useFranchiseDetail(slug: string) {
  return useQuery<FranchiseDetail>({
    queryKey: ['catalog', 'franchises', slug],
    queryFn: () => getFranchiseDetail(slug),
    staleTime: 5 * 60_000,
  });
}
