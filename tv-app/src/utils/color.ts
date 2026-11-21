const SAMPLE_SIZE = 16;
const MIN_CHROMA_SATURATION = 0.12;
const MIN_SATURATION = 0.6;

/** The reference palette, used when the artwork has no usable colour. */
export const FALLBACK_PALETTE: ArtPalette = {
  main: { r: 255, g: 93, b: 177 },
  deep: { r: 224, g: 51, b: 143 },
  light: { r: 242, g: 194, b: 139 },
  opposite: { r: 76, g: 201, b: 217 },
  oppositeDeep: { r: 42, g: 143, b: 181 },
};

interface ColorBucket extends Rgb {
  count: number;
}

/**
 * The most prominent colour in RGBA pixel data. Colours are grouped into 16 levels per channel,
 * each group is averaged, and saturated groups win over grey ones of similar size. Transparent
 * pixels are skipped.
 */
export function dominantColor(rgba: ArrayLike<number>): Rgb {
  const buckets = new Map<number, ColorBucket>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  let best: { score: number; color: Rgb } | null = null;
  for (const bucket of buckets.values()) {
    const color = {
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
    };
    const chroma =
      Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    const score = bucket.count * (0.25 + chroma / 255);
    if (!best || score > best.score) best = { score, color };
  }

  if (!best) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(best.color.r),
    g: Math.round(best.color.g),
    b: Math.round(best.color.b),
  };
}

/** The dominant colour of the artwork, sampled at 16x16. Black until the artwork has loaded. */
export function sampleDominantColor(art: HTMLImageElement): Rgb {
  if (art.width <= 0 || art.height <= 0) return { r: 0, g: 0, b: 0 };
  const sample = document.createElement("canvas");
  sample.width = SAMPLE_SIZE;
  sample.height = SAMPLE_SIZE;
  const ctx = sample.getContext("2d")!;
  ctx.drawImage(art, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return dominantColor(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}

/**
 * A palette from the artwork's dominant colour: a vivid main tone, a deeper shade, a light tint, and
 * the deep and main tones on the opposite hue. Returns null for near-black or near-white grey artwork
 * so the caller keeps its fallback palette.
 */
export function artPalette(color: Rgb): ArtPalette | null {
  const [hue, saturation, lightness] = rgbToHsl(color);
  const grey = saturation < MIN_CHROMA_SATURATION;
  if (grey && (lightness < 0.1 || lightness > 0.92)) return null;

  const sat = grey ? saturation : Math.max(saturation, MIN_SATURATION);
  const tone = (h: number, l: number) => hslToRgb(h, sat, l);
  const opposite = (hue + 0.5) % 1;
  return {
    main: tone(hue, 0.66),
    deep: tone(hue, 0.45),
    light: tone(hue, 0.84),
    opposite: tone(opposite, 0.66),
    oppositeDeep: tone(opposite, 0.45),
  };
}

export function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/** Hue, saturation and lightness, each in 0..1. */
function rgbToHsl({ r, g, b }: Rgb): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [(hue / 6 + 1) % 1, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue * 6;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const offset = lightness - chroma / 2;
  const [r, g, b] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: Math.round((r + offset) * 255),
    g: Math.round((g + offset) * 255),
    b: Math.round((b + offset) * 255),
  };
}
