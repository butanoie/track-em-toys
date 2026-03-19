import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getManufacturerItemFacets } from '@/catalog/api';
import type { ManufacturerItemFilters } from '@/catalog/api';
import type { ManufacturerItemFacets } from '@/lib/zod-schemas';

export function useManufacturerItemFacets(manufacturer: string, filters?: ManufacturerItemFilters) {
  return useQuery<ManufacturerItemFacets>({
    queryKey: ['catalog', 'manufacturer-items', manufacturer, 'facets', filters ?? {}],
    queryFn: () => getManufacturerItemFacets(manufacturer, filters),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
}
