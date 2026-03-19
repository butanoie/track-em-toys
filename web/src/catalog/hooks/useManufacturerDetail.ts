import { useQuery } from '@tanstack/react-query';
import { getManufacturerDetail } from '@/catalog/api';
import type { ManufacturerDetail } from '@/lib/zod-schemas';

export function useManufacturerDetail(slug: string) {
  return useQuery<ManufacturerDetail>({
    queryKey: ['catalog', 'manufacturers', slug],
    queryFn: () => getManufacturerDetail(slug),
    staleTime: 5 * 60_000,
  });
}
