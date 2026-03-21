import sharp from 'sharp';

export interface ProcessedPhoto {
  thumb: Buffer;
  gallery: Buffer;
  original: Buffer;
}

/**
 * Process an uploaded image into three WebP variants:
 * thumb (200x200 cover crop), gallery (800x800 max, no upscale), original (lossless).
 *
 * @param inputBuffer - Raw image buffer from the upload
 */
export async function processUpload(inputBuffer: Buffer): Promise<ProcessedPhoto> {
  const image = sharp(inputBuffer);

  const [thumb, gallery, original] = await Promise.all([
    image.clone().resize(200, 200, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
    image.clone().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
    image.clone().webp({ lossless: true }).toBuffer(),
  ]);

  return { thumb, gallery, original };
}
