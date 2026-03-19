import { useQuery } from '@tanstack/react-query';
import { getCharacterDetail } from '@/catalog/api';
import type { CharacterDetail } from '@/lib/zod-schemas';

export function useCharacterDetail(franchise: string, slug: string | undefined) {
  return useQuery<CharacterDetail>({
    queryKey: ['catalog', 'characters', franchise, slug],
    queryFn: () => getCharacterDetail(franchise, slug!),
    enabled: slug !== undefined && franchise !== '',
    staleTime: 60_000,
  });
}
