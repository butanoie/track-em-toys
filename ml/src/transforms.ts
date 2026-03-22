import sharp from 'sharp';

export interface Transform {
  name: string;
  apply: (input: Buffer, format: 'webp' | 'jpeg') => Promise<Buffer>;
}

const ROTATION_ANGLE = 10;
const BRIGHTNESS_UP = 1.2;
const BRIGHTNESS_DOWN = 0.8;
const WEBP_QUALITY = 85;
const JPEG_QUALITY = 90;

/**
 * Apply output format to a sharp pipeline.
 *
 * @param pipeline - Sharp instance to format
 * @param format - Output format
 */
function toOutput(pipeline: sharp.Sharp, format: 'webp' | 'jpeg'): Promise<Buffer> {
  if (format === 'jpeg') {
    return pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
  }
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
}

/**
 * Build a sharp pipeline that rotates and center-crops to avoid black corner artifacts.
 * After rotation, extracts the largest inscribed rectangle at the original aspect ratio.
 *
 * @param input - Source image buffer
 * @param angleDeg - Rotation angle in degrees
 */
async function rotateAndCrop(input: Buffer, angleDeg: number): Promise<sharp.Sharp> {
  const metadata = await sharp(input).metadata();
  const w = metadata.width ?? 100;
  const h = metadata.height ?? 100;

  const radians = Math.abs(angleDeg) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Expanded canvas dimensions after rotation
  const rotW = Math.round(w * cos + h * sin);
  const rotH = Math.round(h * cos + w * sin);

  // Largest inscribed rectangle at original aspect ratio
  // For a rectangle w×h rotated by θ, the inscribed rectangle dimensions are:
  const cropW = Math.max(1, Math.floor((w * cos * cos - h * cos * sin + h * sin) / (cos * cos + sin * sin)));
  const cropH = Math.max(1, Math.floor((cropW * h) / w));

  // Clamp to not exceed rotated canvas
  const finalW = Math.min(cropW, rotW);
  const finalH = Math.min(cropH, rotH);

  return sharp(input)
    .rotate(angleDeg, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .extract({
      left: Math.max(0, Math.floor((rotW - finalW) / 2)),
      top: Math.max(0, Math.floor((rotH - finalH) / 2)),
      width: finalW,
      height: finalH,
    });
}

// --- Single transforms ---

const hflip: Transform = {
  name: 'hflip',
  apply: (input, format) => toOutput(sharp(input).flop(), format),
};

const rotateCw: Transform = {
  name: 'rotate-cw',
  apply: async (input, format) => toOutput(await rotateAndCrop(input, ROTATION_ANGLE), format),
};

const rotateCcw: Transform = {
  name: 'rotate-ccw',
  apply: async (input, format) => toOutput(await rotateAndCrop(input, -ROTATION_ANGLE), format),
};

const brightnessUp: Transform = {
  name: 'brightness-up',
  apply: (input, format) => toOutput(sharp(input).modulate({ brightness: BRIGHTNESS_UP }), format),
};

const brightnessDown: Transform = {
  name: 'brightness-down',
  apply: (input, format) => toOutput(sharp(input).modulate({ brightness: BRIGHTNESS_DOWN }), format),
};

// --- Compound transform builders ---

function hflipRotate(name: string, angle: number): Transform {
  return {
    name,
    apply: async (input, format) => {
      const flipped = await sharp(input).flop().toBuffer();
      return toOutput(await rotateAndCrop(flipped, angle), format);
    },
  };
}

function hflipBrightness(name: string, brightness: number): Transform {
  return {
    name,
    apply: (input, format) => toOutput(sharp(input).flop().modulate({ brightness }), format),
  };
}

function rotateBrightness(name: string, angle: number, brightness: number): Transform {
  return {
    name,
    apply: async (input, format) => {
      const rotated = await (await rotateAndCrop(input, angle)).toBuffer();
      return toOutput(sharp(rotated).modulate({ brightness }), format);
    },
  };
}

function hflipRotateBrightness(name: string, angle: number, brightness: number): Transform {
  return {
    name,
    apply: async (input, format) => {
      const flipped = await sharp(input).flop().toBuffer();
      const rotated = await (await rotateAndCrop(flipped, angle)).toBuffer();
      return toOutput(sharp(rotated).modulate({ brightness }), format);
    },
  };
}

/**
 * All available augmentation transforms.
 * 15 transforms: 5 single + 8 compound (2-op) + 2 compound (3-op).
 * Deterministic — no randomness.
 */
export const TRANSFORMS: Transform[] = [
  // Single transforms
  hflip,
  rotateCw,
  rotateCcw,
  brightnessUp,
  brightnessDown,
  // 2-op: hflip + rotate
  hflipRotate('hflip-rotate-cw', ROTATION_ANGLE),
  hflipRotate('hflip-rotate-ccw', -ROTATION_ANGLE),
  // 2-op: hflip + brightness
  hflipBrightness('hflip-brightness-up', BRIGHTNESS_UP),
  hflipBrightness('hflip-brightness-down', BRIGHTNESS_DOWN),
  // 2-op: rotate + brightness
  rotateBrightness('rotate-cw-brightness-up', ROTATION_ANGLE, BRIGHTNESS_UP),
  rotateBrightness('rotate-cw-brightness-down', ROTATION_ANGLE, BRIGHTNESS_DOWN),
  rotateBrightness('rotate-ccw-brightness-up', -ROTATION_ANGLE, BRIGHTNESS_UP),
  rotateBrightness('rotate-ccw-brightness-down', -ROTATION_ANGLE, BRIGHTNESS_DOWN),
  // 3-op: hflip + rotate + brightness
  hflipRotateBrightness('hflip-rotate-cw-bright-up', ROTATION_ANGLE, BRIGHTNESS_UP),
  hflipRotateBrightness('hflip-rotate-ccw-bright-dn', -ROTATION_ANGLE, BRIGHTNESS_DOWN),
];
