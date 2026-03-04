import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetchJson } from '@/lib/api-client'
import { LinkAccountResponseSchema, type LinkAccountResponse } from '@/lib/zod-schemas'

interface LinkAccountParams {
  provider: 'apple' | 'google'
  id_token: string
  nonce?: string
}

export function useLinkAccount() {
  const queryClient = useQueryClient()

  return useMutation<LinkAccountResponse, Error, LinkAccountParams>({
    mutationFn: (params) =>
      apiFetchJson('/auth/link-account', LinkAccountResponseSchema, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
