import { useQuery } from '@tanstack/react-query';
import { apiFetchJson } from '@/lib/api-client';
import { LinkAccountResponseSchema, type LinkAccountResponse } from '@/lib/zod-schemas';

export function useMe() {
  return useQuery<LinkAccountResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetchJson('/auth/me', LinkAccountResponseSchema),
  });
}
