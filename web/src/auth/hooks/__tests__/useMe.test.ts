import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useMe } from '../useMe';

vi.mock('@/lib/api-client', () => ({
  apiFetchJson: vi.fn(),
}));

import { apiFetchJson } from '@/lib/api-client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useMe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and return user with linked accounts', async () => {
    const meData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      display_name: 'Test User',
      avatar_url: null,
      linked_accounts: [{ provider: 'google' as const, email: 'test@example.com' }],
    };
    vi.mocked(apiFetchJson).mockResolvedValue(meData);

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(meData);
    expect(apiFetchJson).toHaveBeenCalledWith('/auth/me', expect.anything());
  });

  it('should set isError when the API call fails', async () => {
    vi.mocked(apiFetchJson).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useMe(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
