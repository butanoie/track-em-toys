import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCharacters, type CharacterFilters } from '@/catalog/api';
import type { CharacterList } from '@/lib/zod-schemas';

export function useCharacters(franchise: string, filters?: CharacterFilters, cursor?: string) {
  return useQuery<CharacterList>({
    queryKey: ['catalog', 'characters', franchise, filters ?? {}, cursor ?? null],
    queryFn: () => listCharacters({ franchise, filters, cursor }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
