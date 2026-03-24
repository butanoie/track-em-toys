import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollectionExport } from '../useCollectionExport';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/collection/api', () => ({
  exportCollection: vi.fn(),
}));

vi.mock('@/collection/lib/download', () => ({
  downloadJsonBlob: vi.fn(),
}));

vi.mock('@/lib/zod-schemas', () => ({
  CollectionExportPayloadSchema: {
    safeParse: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { exportCollection } from '@/collection/api';
import { downloadJsonBlob } from '@/collection/lib/download';
import { CollectionExportPayloadSchema } from '@/lib/zod-schemas';

const mockExportData = {
  version: 1,
  exported_at: '2026-03-24T00:00:00.000Z',
  items: [
    {
      franchise_slug: 'transformers',
      item_slug: 'optimus-prime',
      condition: 'mint_sealed',
      notes: null,
      added_at: '2026-03-20T00:00:00Z',
      deleted_at: null,
    },
  ],
};

describe('useCollectionExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets isExporting during export', async () => {
    vi.mocked(exportCollection).mockResolvedValue({
      json: () => Promise.resolve(mockExportData),
    } as unknown as Response);
    vi.mocked(CollectionExportPayloadSchema.safeParse).mockReturnValue({
      success: true,
      data: mockExportData,
    } as ReturnType<typeof CollectionExportPayloadSchema.safeParse>);

    const { result } = renderHook(() => useCollectionExport());
    expect(result.current.isExporting).toBe(false);

    await act(async () => {
      await result.current.runExport();
    });

    expect(result.current.isExporting).toBe(false);
  });

  it('calls downloadJsonBlob and shows success toast on export', async () => {
    vi.mocked(exportCollection).mockResolvedValue({
      json: () => Promise.resolve(mockExportData),
    } as unknown as Response);
    vi.mocked(CollectionExportPayloadSchema.safeParse).mockReturnValue({
      success: true,
      data: mockExportData,
    } as ReturnType<typeof CollectionExportPayloadSchema.safeParse>);

    const { result } = renderHook(() => useCollectionExport());

    await act(async () => {
      await result.current.runExport();
    });

    expect(downloadJsonBlob).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Collection exported', {
      description: '1 item saved to file',
    });
  });

  it('shows error toast when export fails', async () => {
    vi.mocked(exportCollection).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCollectionExport());

    await act(async () => {
      await result.current.runExport();
    });

    expect(toast.error).toHaveBeenCalledWith('Network error');
  });

  it('shows error toast when schema parse fails', async () => {
    vi.mocked(exportCollection).mockResolvedValue({
      json: () => Promise.resolve({ bad: 'data' }),
    } as unknown as Response);
    vi.mocked(CollectionExportPayloadSchema.safeParse).mockReturnValue({
      success: false,
      error: new Error('parse error'),
    } as ReturnType<typeof CollectionExportPayloadSchema.safeParse>);

    const { result } = renderHook(() => useCollectionExport());

    await act(async () => {
      await result.current.runExport();
    });

    expect(toast.error).toHaveBeenCalledWith('Unexpected export format from server');
    expect(downloadJsonBlob).not.toHaveBeenCalled();
  });

  it('passes includeDeleted to exportCollection', async () => {
    vi.mocked(exportCollection).mockResolvedValue({
      json: () => Promise.resolve(mockExportData),
    } as unknown as Response);
    vi.mocked(CollectionExportPayloadSchema.safeParse).mockReturnValue({
      success: true,
      data: mockExportData,
    } as ReturnType<typeof CollectionExportPayloadSchema.safeParse>);

    const { result } = renderHook(() => useCollectionExport());

    await act(async () => {
      await result.current.runExport(true);
    });

    expect(exportCollection).toHaveBeenCalledWith(true);
  });
});
