import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { computeDHash, hammingDistance } from './dhash.js';

// Create a solid-color image buffer via Sharp.
function solidImage(r: number, g: number, b: number, width = 100, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();
}

// Create a checkerboard image buffer (alternating light/dark blocks).
function checkerboardImage(width = 100, height = 100): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  const blockSize = Math.floor(width / 10);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isLight = (Math.floor(x / blockSize) + Math.floor(y / blockSize)) % 2 === 0;
      const v = isLight ? 220 : 30;
      const offset = (y * width + x) * 3;
      pixels[offset] = v;
      pixels[offset + 1] = v;
      pixels[offset + 2] = v;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe('computeDHash', () => {
  it('returns a 16-character lowercase hex string', async () => {
    const buf = await solidImage(128, 128, 128);
    const hash = await computeDHash(buf);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same image produces same hash', async () => {
    const buf = await solidImage(200, 100, 50);
    const hash1 = await computeDHash(buf);
    const hash2 = await computeDHash(buf);
    expect(hash1).toBe(hash2);
  });

  it('produces identical hashes for same image at different resolutions', async () => {
    const small = await solidImage(128, 64, 32, 200, 200);
    const large = await solidImage(128, 64, 32, 1600, 1600);
    const hashSmall = await computeDHash(small);
    const hashLarge = await computeDHash(large);
    expect(hammingDistance(hashSmall, hashLarge)).toBe(0);
  });

  it('produces different hashes for visually different images', async () => {
    const dark = await solidImage(10, 10, 10);
    const checkerboard = await checkerboardImage();
    const hashDark = await computeDHash(dark);
    const hashCheckerboard = await computeDHash(checkerboard);
    expect(hammingDistance(hashDark, hashCheckerboard)).toBeGreaterThan(10);
  });
});

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('abcdef0123456789', 'abcdef0123456789')).toBe(0);
  });

  it('returns 64 for all-zeros vs all-ones', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('returns 1 for a single bit difference', () => {
    // 0x0000000000000000 vs 0x0000000000000001 differ by 1 bit
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });

  it('counts correctly for known bit patterns', () => {
    // 0xff = 11111111, 0x00 = 00000000 → 8 bits differ in last byte
    expect(hammingDistance('00000000000000ff', '0000000000000000')).toBe(8);
  });
});

