import sharp from 'sharp';

export const MIN_DIMENSION = 600;

export interface ProcessedPhoto {
  thumb: Buffer;
  original: Buffer;
}

/**
 * Process an uploaded image into two WebP variants:
 * thumb (200px longest edge, no crop, no upscale), original (1600px longest edge, no upscale).
 *
 * Rejects images whose smallest edge is under 600px.
 *
 * @param inputBuffer - Raw image buffer from the upload
 * @throws {DimensionError} if the smallest edge is under MIN_DIMENSION
 */
export async function processUpload(inputBuffer: Buffer): Promise<ProcessedPhoto> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const smallest = Math.min(width, height);

  if (smallest < MIN_DIMENSION) {
    throw new DimensionError(`Image too small: ${width}x${height}. Minimum ${MIN_DIMENSION}px on the shortest edge.`);
  }

  const [thumb, original] = await Promise.all([
    image.clone().resize(200, 200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    image.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
  ]);

  return { thumb, original };
}

/** Thrown when an uploaded image does not meet the minimum dimension requirement. */
export class DimensionError extends Error {
  /**
   * Creates a DimensionError with the given message.
   *
   * @param message - Description of the dimension violation.
   */
  constructor(message: string) {
    super(message);
    this.name = 'DimensionError';
  }
}
