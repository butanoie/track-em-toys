import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processUpload, DimensionError, MIN_DIMENSION } from './thumbnails.js';

async function createTestImage(width = 800, height = 800): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe('processUpload', () => {
  it('produces two WebP buffers', async () => {
    const input = await createTestImage();
    const result = await processUpload(input);

    expect(result.thumb).toBeInstanceOf(Buffer);
    expect(result.original).toBeInstanceOf(Buffer);

    for (const buf of [result.thumb, result.original]) {
      expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
    }
  });

  it('scales thumbnail to fit within 200x200 preserving aspect ratio', async () => {
    const input = await createTestImage(1000, 800);
    const result = await processUpload(input);

    const thumbMeta = await sharp(result.thumb).metadata();
    expect(thumbMeta.width).toBe(200);
    expect(thumbMeta.height).toBe(160);
  });

  it('does not upscale original when under 1600px', async () => {
    const input = await createTestImage(800, 600);
    const result = await processUpload(input);

    const originalMeta = await sharp(result.original).metadata();
    expect(originalMeta.width).toBe(800);
    expect(originalMeta.height).toBe(600);
  });

  it('caps original at 1600px longest edge', async () => {
    const input = await createTestImage(3000, 2000);
    const result = await processUpload(input);

    const originalMeta = await sharp(result.original).metadata();
    expect(originalMeta.width).toBeLessThanOrEqual(1600);
    expect(originalMeta.height).toBeLessThanOrEqual(1600);
  });

  it('throws DimensionError when smallest edge is under minimum', async () => {
    const input = await createTestImage(1000, 300);
    await expect(processUpload(input)).rejects.toThrow(DimensionError);
    await expect(processUpload(input)).rejects.toThrow(/1000x300/);
    await expect(processUpload(input)).rejects.toThrow(new RegExp(`${MIN_DIMENSION}px`));
  });

  it('accepts image at exactly the minimum dimension', async () => {
    const input = await createTestImage(MIN_DIMENSION, MIN_DIMENSION);
    const result = await processUpload(input);
    expect(result.thumb).toBeInstanceOf(Buffer);
    expect(result.original).toBeInstanceOf(Buffer);
  });

  it('throws DimensionError when both edges are too small', async () => {
    const input = await createTestImage(300, 200);
    await expect(processUpload(input)).rejects.toThrow(DimensionError);
  });

  it('throws on invalid image data', async () => {
    const garbage = Buffer.from('not an image');
    await expect(processUpload(garbage)).rejects.toThrow();
  });
});
