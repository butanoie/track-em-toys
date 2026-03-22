import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { TRANSFORMS } from './transforms.js';

let testImageBuffer: Buffer;

beforeAll(async () => {
  // Generate a 50x30 test image — large enough for rotation + crop to work correctly
  testImageBuffer = await sharp({
    create: { width: 50, height: 30, channels: 3, background: { r: 128, g: 64, b: 200 } },
  })
    .webp({ quality: 85 })
    .toBuffer();
});

describe('TRANSFORMS registry', () => {
  it('has 15 transforms', () => {
    expect(TRANSFORMS).toHaveLength(15);
  });

  it('has unique names', () => {
    const names = TRANSFORMS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const transform of TRANSFORMS) {
    it(`"${transform.name}" produces valid WebP output`, async () => {
      const output = await transform.apply(testImageBuffer, 'webp');

      expect(output).toBeInstanceOf(Buffer);
      expect(output.length).toBeGreaterThan(0);

      // Validate it's a valid image by checking sharp can read metadata
      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe('webp');
    });

    it(`"${transform.name}" produces valid JPEG output`, async () => {
      const output = await transform.apply(testImageBuffer, 'jpeg');

      expect(output).toBeInstanceOf(Buffer);
      expect(output.length).toBeGreaterThan(0);

      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe('jpeg');
    });
  }

  it('produces deterministic output', async () => {
    const first = TRANSFORMS[0];
    expect(first).toBeDefined();

    const output1 = await first!.apply(testImageBuffer, 'webp');
    const output2 = await first!.apply(testImageBuffer, 'webp');

    expect(output1.equals(output2)).toBe(true);
  });
});
