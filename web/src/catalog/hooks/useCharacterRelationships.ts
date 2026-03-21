import { useQuery } from '@tanstack/react-query';
import { getCharacterRelationships } from '@/catalog/api';
import type { CharacterRelationshipsResponse } from '@/lib/zod-schemas';

export function useCharacterRelationships(franchise: string, slug: string | undefined) {
  return useQuery<CharacterRelationshipsResponse>({
    queryKey: ['catalog', 'characters', franchise, slug, 'relationships'],
    queryFn: () => getCharacterRelationships(franchise, slug!),
    enabled: slug !== undefined && franchise !== '',
    staleTime: 60_000,
  });
}
