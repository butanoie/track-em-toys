import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useLinkAccount } from '../useLinkAccount'

vi.mock('@/lib/api-client', () => ({
  apiFetchJson: vi.fn(),
}))

import { apiFetchJson } from '@/lib/api-client'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useLinkAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call apiFetchJson with POST method and provider params', async () => {
    const responseData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      display_name: 'Test User',
      avatar_url: null,
      linked_accounts: [
        { provider: 'google' as const, email: 'test@example.com' },
        { provider: 'apple' as const, email: 'apple@example.com' },
      ],
    }
    vi.mocked(apiFetchJson).mockResolvedValue(responseData)

    const { result } = renderHook(() => useLinkAccount(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.mutateAsync({
        provider: 'apple',
        id_token: 'test-id-token',
        nonce: 'test-nonce',
      })
    })

    expect(apiFetchJson).toHaveBeenCalledWith(
      '/auth/link-account',
      expect.anything(),
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'apple', id_token: 'test-id-token', nonce: 'test-nonce' }),
      },
    )
  })

  it('should set isError when the mutation fails', async () => {
    vi.mocked(apiFetchJson).mockRejectedValue(new Error('Conflict'))

    const { result } = renderHook(() => useLinkAccount(), { wrapper: createWrapper() })

    await act(async () => {
      try {
        await result.current.mutateAsync({ provider: 'google', id_token: 'bad-token' })
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
