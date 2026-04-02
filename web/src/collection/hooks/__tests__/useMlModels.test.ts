import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/collection/api', () => ({
  listMlModels: vi.fn().mockResolvedValue({
    models: [
      {
        name: 'primary-classifier',
        version: 'v1',
        category: 'primary',
        format: 'onnx',
        class_count: 10,
        accuracy: 0.85,
        input_shape: [1, 3, 224, 224],
        size_bytes: 7000000,
        download_url: 'http://localhost/model.onnx',
        metadata_url: 'http://localhost/model-metadata.json',
        trained_at: '2026-03-31T00:00:00Z',
        exported_at: '2026-03-31T00:00:00Z',
      },
    ],
  }),
}));

import { useMlModels } from '../useMlModels';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useMlModels', () => {
  it('fetches model metadata', async () => {
    const { result } = renderHook(() => useMlModels(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.models).toHaveLength(1);
    expect(result.current.data?.models[0]?.name).toBe('primary-classifier');
  });
});
