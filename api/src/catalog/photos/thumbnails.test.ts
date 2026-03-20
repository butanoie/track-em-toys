import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processUpload } from './thumbnails.js';

// Create a minimal 10×10 red PNG as a test fixture
async function createTestImage(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe('processUpload', () => {
  it('produces three WebP buffers', async () => {
    const input = await createTestImage();
    const result = await processUpload(input);

    expect(result.thumb).toBeInstanceOf(Buffer);
    expect(result.gallery).toBeInstanceOf(Buffer);
    expect(result.original).toBeInstanceOf(Buffer);

    // All outputs should be WebP (starts with RIFF...WEBP magic bytes)
    for (const buf of [result.thumb, result.gallery, result.original]) {
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('produces a 200x200 thumbnail from a large image', async () => {
    const input = await createTestImage(1000, 800);
    const result = await processUpload(input);

    const thumbMeta = await sharp(result.thumb).metadata();
    expect(thumbMeta.width).toBe(200);
    expect(thumbMeta.height).toBe(200);
  });

  it('does not upscale a small image for gallery size', async () => {
    const input = await createTestImage(100, 80);
    const result = await processUpload(input);

    const galleryMeta = await sharp(result.gallery).metadata();
    expect(galleryMeta.width).toBeLessThanOrEqual(100);
    expect(galleryMeta.height).toBeLessThanOrEqual(80);
  });

  it('throws on invalid image data', async () => {
    const garbage = Buffer.from('not an image');
    await expect(processUpload(garbage)).rejects.toThrow();
  });
});
