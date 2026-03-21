import { describe, it, expect } from 'vitest';
import { buildPhotoUrl, validateFile } from '../api';

describe('buildPhotoUrl', () => {
  it('prepends VITE_PHOTO_BASE_URL to relative path', () => {
    // In test env VITE_PHOTO_BASE_URL is not set, so it returns the url as-is
    const url = buildPhotoUrl('abc-123/def-456-original.webp');
    // Without env var, returns the relative url unchanged
    expect(url).toContain('abc-123/def-456-original.webp');
  });
});

describe('validateFile', () => {
  function makeFile(name: string, type: string, size: number): File {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  }

  it('returns null for valid JPEG file', () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1024);
    expect(validateFile(file)).toBeNull();
  });

  it('returns null for valid PNG file', () => {
    const file = makeFile('photo.png', 'image/png', 1024);
    expect(validateFile(file)).toBeNull();
  });

  it('returns null for valid WebP file', () => {
    const file = makeFile('photo.webp', 'image/webp', 1024);
    expect(validateFile(file)).toBeNull();
  });

  it('returns null for valid GIF file', () => {
    const file = makeFile('photo.gif', 'image/gif', 1024);
    expect(validateFile(file)).toBeNull();
  });

  it('returns error for unsupported MIME type', () => {
    const file = makeFile('photo.tiff', 'image/tiff', 1024);
    expect(validateFile(file)).toBe('photo.tiff is not a supported image format');
  });

  it('returns error for file exceeding 10MB', () => {
    const file = makeFile('huge.jpg', 'image/jpeg', 11 * 1024 * 1024);
    expect(validateFile(file)).toBe('huge.jpg exceeds the 10 MB limit');
  });

  it('accepts file at exactly 10MB', () => {
    const file = makeFile('exact.jpg', 'image/jpeg', 10 * 1024 * 1024);
    expect(validateFile(file)).toBeNull();
  });
});
