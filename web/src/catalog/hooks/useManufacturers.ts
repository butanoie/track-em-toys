import { useQuery } from '@tanstack/react-query';
import { listManufacturerStats } from '@/catalog/api';
import type { ManufacturerStatsList } from '@/lib/zod-schemas';

export function useManufacturers() {
  return useQuery<ManufacturerStatsList>({
    queryKey: ['catalog', 'manufacturers', 'stats'],
    queryFn: listManufacturerStats,
    staleTime: 5 * 60_000,
  });
}
