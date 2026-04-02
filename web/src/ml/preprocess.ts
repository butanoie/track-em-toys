/**
 * Image preprocessing for MobileNetV3 inference.
 * Resizes to 224x224, normalizes with ImageNet mean/std, outputs NCHW Float32Array.
 */

const INPUT_SIZE = 224;
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/**
 * Preprocess an image file for MobileNetV3: resize to 224x224, normalize
 * with ImageNet mean/std, output as Float32Array in NCHW layout [1, 3, 224, 224].
 *
 * @param file - Image file from user input
 */
export async function preprocessImage(file: File): Promise<Float32Array> {
  const bitmap = await createImageBitmap(file);

  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');

  ctx.drawImage(bitmap, 0, 0, INPUT_SIZE, INPUT_SIZE);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data: rgba } = imageData;
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * pixels);

  for (let i = 0; i < pixels; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    tensor[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    tensor[pixels + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    tensor[2 * pixels + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  return tensor;
}
