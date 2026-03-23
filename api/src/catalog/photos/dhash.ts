import sharp from 'sharp';

/**
 * Compute a 64-bit dHash (difference hash) for an image buffer.
 *
 * Resizes to 9x8 greyscale and compares adjacent pixels horizontally.
 * 8 rows x 8 comparisons = 64 bits, returned as a 16-character hex string.
 *
 * @param buffer - Raw image buffer (any format Sharp supports)
 */
export async function computeDHash(buffer: Buffer): Promise<string> {
  const raw = await sharp(buffer).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();

  let bits = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i = row * 9 + col;
      bits = (bits << 1n) | (raw[i]! > raw[i + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

/**
 * Hamming distance between two 16-character hex dHash strings.
 * Counts the number of differing bits (0–64).
 *
 * @param a - First dHash hex string
 * @param b - Second dHash hex string
 */
export function hammingDistance(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}
