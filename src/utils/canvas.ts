import type { Canvas } from "@napi-rs/canvas";

type CanvasContext = ReturnType<Canvas["getContext"]>;

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
