import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api', () => ({
  getMlStatsSummary: vi.fn().mockResolvedValue({
    total_scans: 50,
    scans_completed: 40,
    scans_failed: 2,
    predictions_accepted: 20,
    acceptance_rate: 0.4,
    error_rate: 0.04,
    by_model: [{ model_name: 'primary', scans: 50, accepted: 20 }],
  }),
  getMlStatsDaily: vi.fn().mockResolvedValue({ data: [] }),
  getMlStatsModels: vi.fn().mockResolvedValue({ data: [] }),
}));

import { useMlStatsSummary, useMlStatsDaily, useMlStatsModels } from '../hooks';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useMlStatsSummary', () => {
  it('fetches summary stats', async () => {
    const { result } = renderHook(() => useMlStatsSummary(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_scans).toBe(50);
  });
});

describe('useMlStatsDaily', () => {
  it('fetches daily stats', async () => {
    const { result } = renderHook(() => useMlStatsDaily(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toEqual([]);
  });
});

describe('useMlStatsModels', () => {
  it('fetches model stats', async () => {
    const { result } = renderHook(() => useMlStatsModels(30), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toEqual([]);
  });
});
