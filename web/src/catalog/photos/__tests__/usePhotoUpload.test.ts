import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePhotoUpload } from '../usePhotoUpload';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUploadPhoto = vi.fn();
vi.mock('../api', () => {
  class DuplicateUploadError extends Error {
    constructor(
      public readonly matchedId: string,
      public readonly matchedUrl: string
    ) {
      super('A duplicate image has already been uploaded for this item');
      this.name = 'DuplicateUploadError';
    }
  }

  return {
    uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
    validateFile: (file: File) => {
      if (file.type === 'image/tiff') return `${file.name} is not a supported image format`;
      if (file.size > 10 * 1024 * 1024) return `${file.name} exceeds the 10 MB limit`;
      return null;
    },
    buildPhotoUrl: (url: string) => url,
    DuplicateUploadError,
  };
});

function makeFile(name: string, type = 'image/jpeg', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

describe('usePhotoUpload', () => {
  const onUploadComplete = vi.fn();
  const defaultOpts = { franchise: 'transformers', itemSlug: 'optimus-prime', onUploadComplete };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadPhoto.mockResolvedValue([
      { id: 'p-1', url: 'test.webp', caption: null, is_primary: false, sort_order: 0, status: 'approved' },
    ]);
  });

  it('starts with empty items and isUploading false', () => {
    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    expect(result.current.items).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
  });

  it('enqueues valid files', () => {
    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    act(() => {
      result.current.uploadFiles([makeFile('photo1.jpg'), makeFile('photo2.jpg')]);
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].fileName).toBe('photo1.jpg');
    expect(result.current.items[1].fileName).toBe('photo2.jpg');
  });

  it('rejects invalid MIME type with toast.error', async () => {
    const { toast } = await import('sonner');
    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    act(() => {
      result.current.uploadFiles([makeFile('bad.tiff', 'image/tiff')]);
    });

    expect(result.current.items).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('bad.tiff is not a supported image format');
  });

  it('processes upload and calls onUploadComplete on success', async () => {
    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    act(() => {
      result.current.uploadFiles([makeFile('photo.jpg')]);
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalled();
    });

    expect(mockUploadPhoto).toHaveBeenCalledWith(
      'transformers',
      'optimus-prime',
      expect.any(File),
      expect.any(Function)
    );
  });

  it('handles duplicate upload error with specific toast message', async () => {
    const { toast } = await import('sonner');
    const { DuplicateUploadError } = await import('../api');
    mockUploadPhoto.mockRejectedValueOnce(new DuplicateUploadError('existing-id', 'item-1/existing-id-original.webp'));

    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    act(() => {
      result.current.uploadFiles([makeFile('duplicate.jpg')]);
    });

    await waitFor(() => {
      expect(result.current.items.find((i) => i.fileName === 'duplicate.jpg')?.status).toBe('error');
    });

    expect(toast.error).toHaveBeenCalledWith('duplicate.jpg is a duplicate', {
      description: 'This image matches an existing photo for this item.',
    });
  });

  it('handles upload error and continues processing next file', async () => {
    mockUploadPhoto
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce([
        { id: 'p-2', url: 'test2.webp', caption: null, is_primary: false, sort_order: 1, status: 'approved' },
      ]);

    const { result } = renderHook(() => usePhotoUpload(defaultOpts));

    act(() => {
      result.current.uploadFiles([makeFile('fail.jpg'), makeFile('success.jpg')]);
    });

    // Wait for both to process — waitFor expects an assertion that throws on failure
    await waitFor(() => {
      expect(result.current.items.find((i) => i.fileName === 'fail.jpg')?.status).toBe('error');
    });

    await waitFor(() => {
      expect(result.current.items.find((i) => i.fileName === 'success.jpg')?.status).toBe('done');
    });
  });
});
