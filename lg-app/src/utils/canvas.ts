import { rgba } from "./color.js";

/** A horizontal gradient across the artwork palette: main tone, light tint, opposite hue. */
export function artGradient(
  ctx: CanvasContext,
  fromX: number,
  toX: number,
  palette: ArtPalette,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(fromX, 0, toX, 0);
  gradient.addColorStop(0, rgba(palette.main, 1));
  gradient.addColorStop(0.5, rgba(palette.light, 1));
  gradient.addColorStop(1, rgba(palette.opposite, 1));
  return gradient;
}

/** The square artwork, cropped to its centre and drawn centred on the origin. */
export function drawCoverArt(
  ctx: CanvasContext,
  art: HTMLImageElement,
  size: number,
): void {
  if (art.width <= 0 || art.height <= 0) return;
  const side = Math.min(art.width, art.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    art,
    (art.width - side) / 2,
    (art.height - side) / 2,
    side,
    side,
    -size / 2,
    -size / 2,
    size,
    size,
  );
}

export function fillEllipse(
  ctx: CanvasContext,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function roundRect(
  ctx: CanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function wrapText(
  ctx: CanvasContext,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function fillTriangle(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  color: string,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [px, py] of rest) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** The white outline that marks the remote's selection on a stage box. */
export function focusRing(ctx: CanvasContext, box: Box): void {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(box.x - 2, box.y - 2, box.width + 4, box.height + 4);
  ctx.restore();
}
