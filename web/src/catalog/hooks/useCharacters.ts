import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listCharacters, type CharacterFilters } from '@/catalog/api';
import type { CharacterList } from '@/lib/zod-schemas';

export function useCharacters(franchise: string, filters?: CharacterFilters, page?: number, limit?: number) {
  return useQuery<CharacterList>({
    queryKey: ['catalog', 'characters', franchise, filters ?? {}, page ?? 1, limit ?? 20],
    queryFn: () => listCharacters({ franchise, filters, page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
