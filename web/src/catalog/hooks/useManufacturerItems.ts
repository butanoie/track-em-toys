import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listManufacturerItems } from '@/catalog/api';
import type { ManufacturerItemFilters } from '@/catalog/api';
import type { CatalogItemList } from '@/lib/zod-schemas';

export function useManufacturerItems(manufacturer: string, filters: ManufacturerItemFilters, cursor?: string) {
  return useQuery<CatalogItemList>({
    queryKey: ['catalog', 'manufacturer-items', manufacturer, filters, cursor ?? null],
    queryFn: () => listManufacturerItems({ manufacturer, filters, cursor }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
