import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listManufacturerItems } from '@/catalog/api';
import type { ManufacturerItemFilters } from '@/catalog/api';
import type { CatalogItemList } from '@/lib/zod-schemas';

export function useManufacturerItems(
  manufacturer: string,
  filters: ManufacturerItemFilters,
  page?: number,
  limit?: number
) {
  return useQuery<CatalogItemList>({
    queryKey: ['catalog', 'manufacturer-items', manufacturer, filters, page ?? 1, limit ?? 20],
    queryFn: () => listManufacturerItems({ manufacturer, filters, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
