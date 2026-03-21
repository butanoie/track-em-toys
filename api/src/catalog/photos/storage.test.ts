import { describe, it, expect } from 'vitest';
import { photoDir, photoPath, photoRelativeUrl } from './storage.js';

describe('photo storage path helpers', () => {
  const storagePath = '/data/photos';
  const itemId = 'abc-123';
  const photoId = 'def-456';

  it('builds correct directory path', () => {
    expect(photoDir(storagePath, itemId)).toBe('/data/photos/abc-123');
  });

  it('builds correct file path for each size', () => {
    expect(photoPath(storagePath, itemId, photoId, 'thumb')).toBe('/data/photos/abc-123/def-456-thumb.webp');
    expect(photoPath(storagePath, itemId, photoId, 'original')).toBe('/data/photos/abc-123/def-456-original.webp');
  });

  it('builds correct relative URL for database storage', () => {
    expect(photoRelativeUrl(itemId, photoId)).toBe('abc-123/def-456-original.webp');
  });
});
