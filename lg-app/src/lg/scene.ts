import { skyAt } from "../../../src/utils/sky.js";
import type { SkySnapshot } from "../../../src/utils/sky.js";

/** The reference scene's coordinate space; the animator scales it up to the render size. */
export const STAGE_WIDTH = 400;
export const STAGE_HEIGHT = 225;

// Measured on the Fire TV: a 1080p canvas runs at ~15 fps, 1280x720 holds the 30 fps target.
// Kept 16:9 so the stage fills the canvas exactly.
export const RENDER_WIDTH = 1280;
export const RENDER_HEIGHT = 720;
export const SCENE_SCALE = RENDER_WIDTH / STAGE_WIDTH;

const STARS: readonly (readonly [number, number, number])[] = [
  [30, 20, 1.2],
  [70, 60, 1],
  [120, 25, 1.5],
  [160, 70, 1],
  [190, 15, 1.2],
  [240, 50, 1.5],
  [280, 22, 1],
  [300, 85, 1.2],
  [360, 25, 1.5],
  [380, 70, 1],
  [20, 90, 1.2],
  [140, 100, 1],
  [220, 95, 1.2],
  [345, 110, 1],
];

const CLOUDS: readonly (readonly [number, number, number, number])[] = [
  [80, 48, 30, 9],
  [98, 41, 20, 9],
  [230, 30, 26, 7],
  [246, 25, 16, 7],
];

// Vertical tufts: start point and end point of each blade.
const GRASS: readonly (readonly [
  readonly [number, number],
  readonly [number, number],
])[] = [
  [
    [30, 205],
    [27, 198],
  ],
  [
    [33, 205],
    [34, 197],
  ],
  [
    [36, 205],
    [40, 199],
  ],
  [
    [140, 215],
    [137, 208],
  ],
  [
    [143, 215],
    [144, 207],
  ],
  [
    [146, 215],
    [150, 209],
  ],
  [
    [270, 208],
    [267, 201],
  ],
  [
    [273, 208],
    [274, 200],
  ],
  [
    [276, 208],
    [280, 202],
  ],
  [
    [360, 216],
    [357, 209],
  ],
  [
    [363, 216],
    [364, 208],
  ],
  [
    [366, 216],
    [370, 210],
  ],
  [
    [95, 200],
    [92, 194],
  ],
  [
    [98, 200],
    [99, 193],
  ],
  [
    [101, 200],
    [104, 195],
  ],
];

const FLOWERS: readonly (readonly [number, number, number, string])[] = [
  [60, 212, 3, "#f48fb1"],
  [68, 207, 2.5, "#ffffff"],
  [210, 218, 3, "#ffd54f"],
  [305, 210, 3, "#f48fb1"],
  [380, 205, 2.5, "#ffffff"],
  [120, 198, 2.5, "#ffd54f"],
];

/** The static meadow for one sky: everything except the twinkling stars. */
function drawBackdrop(ctx: CanvasContext, sky: SkySnapshot): void {
  const bodyX = sky.bodyX * STAGE_WIDTH;
  const bodyY = sky.bodyY * STAGE_HEIGHT;

  const gradient = ctx.createLinearGradient(0, 0, 0, 190);
  gradient.addColorStop(0, sky.skyTop);
  gradient.addColorStop(1, sky.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_WIDTH, 190);

  ctx.save();
  ctx.globalAlpha = sky.glowOpacity * 0.9;
  const glow = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, 95);
  glow.addColorStop(0, sky.glowColor);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(bodyX, bodyY, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (sky.isDay) {
    ctx.beginPath();
    ctx.arc(bodyX, bodyY, 17, 0, Math.PI * 2);
    ctx.fillStyle = sky.bodyColor;
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(bodyX, bodyY);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = sky.bodyColor;
    ctx.fill();
    ctx.fillStyle = "#dcd8c2";
    ctx.beginPath();
    ctx.arc(-4, -3, 3, 0, Math.PI * 2);
    ctx.arc(5, 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = sky.cloud;
  for (const [x, y, rx, ry] of CLOUDS) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = sky.hillFar;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.quadraticCurveTo(80, 108, 170, 144);
  ctx.quadraticCurveTo(260, 180, 400, 132);
  ctx.lineTo(400, 190);
  ctx.lineTo(0, 190);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = sky.hillNear;
  ctx.beginPath();
  ctx.moveTo(0, 168);
  ctx.quadraticCurveTo(100, 138, 210, 165);
  ctx.quadraticCurveTo(320, 192, 400, 158);
  ctx.lineTo(400, 190);
  ctx.lineTo(0, 190);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = sky.ground;
  ctx.fillRect(0, 186, STAGE_WIDTH, 39);
  ctx.fillStyle = sky.groundEdge;
  ctx.fillRect(0, 186, STAGE_WIDTH, 5);

  ctx.save();
  ctx.strokeStyle = "#5fae63";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [start, end] of GRASS) {
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
  }
  ctx.stroke();
  ctx.restore();

  for (const [x, y, radius, color] of FLOWERS) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** The stars twinkle every frame, so they are drawn live over the cached backdrop. */
function drawStars(
  ctx: CanvasContext,
  seconds: number,
  sky: SkySnapshot,
): void {
  ctx.save();
  ctx.globalAlpha = sky.stars * (0.85 + 0.15 * Math.sin(seconds * 2));
  ctx.fillStyle = "#ffffff";
  for (const [x, y, radius] of STARS) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws the meadow behind every TV state from an offscreen copy of the backdrop, redrawn only when
 * the minute of the day changes, and returns the sky it used so the night overlay can follow it.
 */
export class MeadowBackdrop {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasContext;
  private minute = -1;

  constructor() {
    this.canvas.width = RENDER_WIDTH;
    this.canvas.height = RENDER_HEIGHT;
    this.ctx = this.canvas.getContext("2d")!;
  }

  /** `hour` is the local hour of the day (0..24); the sky is sampled per minute, so it moves smoothly. */
  draw(target: CanvasContext, seconds: number, hour: number): SkySnapshot {
    const minute = Math.floor(hour * 60);
    const sky = skyAt(minute / 60);
    if (minute !== this.minute) {
      this.minute = minute;
      this.ctx.setTransform(SCENE_SCALE, 0, 0, SCENE_SCALE, 0, 0);
      drawBackdrop(this.ctx, sky);
    }
    target.drawImage(this.canvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    drawStars(target, seconds, sky);
    return sky;
  }
}

/** The night tint the reference lays over everything, content included. */
export function drawNightOverlay(ctx: CanvasContext, sky: SkySnapshot): void {
  if (sky.night <= 0) return;
  ctx.save();
  ctx.globalAlpha = sky.night;
  ctx.fillStyle = "#0a1030";
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  ctx.restore();
}
