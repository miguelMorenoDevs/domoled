export interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Bucket extends Rgb {
  count: number;
}

/**
 * The most prominent colour in RGBA pixel data. Colours are grouped into 16 levels per channel,
 * each group is averaged, and saturated groups win over grey ones of similar size. Transparent
 * pixels are skipped.
 */
export function dominantColor(rgba: ArrayLike<number>): Rgb {
  const buckets = new Map<number, Bucket>();
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
