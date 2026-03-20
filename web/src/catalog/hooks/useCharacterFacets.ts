import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getCharacterFacets, type CharacterFilters } from '@/catalog/api';
import type { CharacterFacets } from '@/lib/zod-schemas';

export function useCharacterFacets(franchise: string, filters?: CharacterFilters) {
  return useQuery<CharacterFacets>({
    queryKey: ['catalog', 'characters', franchise, 'facets', filters ?? {}],
    queryFn: () => getCharacterFacets(franchise, filters),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
  });
}
