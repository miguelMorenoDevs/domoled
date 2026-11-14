import type {
  AnimationFrame,
  AnimationPhaseState,
  CalicoTimingConfig,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CALICO_TIMING } from "../../../../src/animator/timing.js";
import { fillEllipse } from "../../utils/canvas.js";
import { lerp } from "../../utils/math.js";

const OUTLINE = "#2a2421";
const WHITE = "#fffdfa";
const WHITE_FAR = "#ebe6df";
const ORANGE = "#e8872a";
const BLACK = "#2b2a2e";
const BROWN = "#3a2b24";
const PINK = "#f6b3b8";
const EAR_PINK = "#f2a5a8";
const IRIS = "#f2c94c";
const PUPIL = "#1b1512";
const NOSE = "#f08c9e";
const SHADOW = "#2f5a35";
const SLEEP_Z = "#4f5fa8";

// Reference proportions: the cat sits in a 400x225 scene, 1.2x its local units, lifted by 62 per `by`.
const SCENE_CENTER_X = 200;
const SCENE_GROUND_Y = 190;
const CAT_SCALE = 1.2;
const BODY_LIFT = 62;
const DEGREES = 57.3;
const RAD = Math.PI / 180;
const START_X = -340;
const END_X = 360;
const TAU = Math.PI * 2;

const BASE_POSE: CatPoseParams = {
  by: 1,
  pitch: 0,
  head: 0,
  fS: 1,
  hS: 1,
  reach: 0,
  tBase: 0.5,
  tAmp: 0.25,
  breath: 0.02,
  eye: 1,
};

const POSES: Record<CatPoseName, CatPoseParams> = {
  sit: {
    ...BASE_POSE,
    by: 0.8,
    pitch: 0.5,
    head: 0.05,
    fS: 1.05,
    hS: 0.45,
    tBase: -0.1,
    tAmp: 0.3,
    breath: 0.025,
  },
  sleep: {
    ...BASE_POSE,
    by: 0.5,
    head: -0.6,
    fS: 0.35,
    hS: 0.35,
    tBase: 1.3,
    tAmp: 0.05,
    breath: 0.05,
    eye: 0,
  },
  crouch: {
    ...BASE_POSE,
    by: 0.7,
    pitch: -0.25,
    fS: 0.5,
    hS: 0.8,
    tBase: 0.9,
    tAmp: 0.6,
    breath: 0.03,
  },
  leap: {
    ...BASE_POSE,
    by: 1,
    pitch: 0.35,
    head: 0.3,
    fS: 1.1,
    hS: 1.1,
    reach: 0.8,
    tBase: 1,
    tAmp: 0.1,
  },
  stretch: {
    ...BASE_POSE,
    by: 0.95,
    pitch: -0.45,
    head: -0.3,
    fS: 0.7,
    hS: 1.2,
    reach: 0.4,
    tBase: 0.9,
    tAmp: 0.1,
    breath: 0.04,
  },
};

const POSE_KEYS = Object.keys(BASE_POSE) as (keyof CatPoseParams)[];

// Hip x, and 0 for a front leg or 1 for a hind leg.
const HIPS: readonly (readonly [number, number])[] = [
  [40, 0],
  [26, 0],
  [-26, 1],
  [-40, 1],
];

const ZS: readonly (readonly [number, number, number])[] = [
  [290, 120, 16],
  [302, 105, 22],
  [318, 86, 28],
];

/**
 * Stand and stretch (each 0..1) at loopMs into the loop: the cat sleeps for sleepMs, then stands up,
 * stretches in the middle of stretchMs, and lies back down to sleep. The cycle repeats.
 */
function standStretchAt(
  loopMs: number,
  timing: CalicoTimingConfig,
): { stand: number; stretch: number } {
  const t = (loopMs % (timing.sleepMs + timing.stretchMs)) - timing.sleepMs;
  if (t < 0 || t >= timing.stretchMs) return { stand: 0, stretch: 0 };
  const u = t / timing.stretchMs;
  const stand = Math.min(1, u / 0.2, (1 - u) / 0.2);
  const s = (u - 0.25) / 0.5;
  const stretch = s > 0 && s < 1 ? Math.sin(Math.PI * s) : 0;
  return { stand, stretch };
}

/** The cat's pose and position for one phase of the shared intro/loop/outro lifecycle. */
function calicoTarget(
  state: AnimationPhaseState,
  timing: CalicoTimingConfig,
): CatTarget {
  const ms = state.elapsedInPhaseMs;

  switch (state.phase) {
    case "intro": {
      if (ms < timing.introJumpMs) {
        const progress = ms / timing.introJumpMs;
        return {
          pose: "leap",
          x: lerp(START_X, 0, progress),
          jump: Math.sin(Math.PI * progress) * 0.7,
        };
      }
      const settle = (ms - timing.introJumpMs) / timing.introSettleMs;
      return {
        pose: settle < 0.5 ? "crouch" : "sit",
        x: 0,
        jump: 0,
      };
    }
    case "loop": {
      const { stand, stretch } = standStretchAt(ms, timing);
      return {
        pose: stretch > 0.01 ? "stretch" : stand > 0.01 ? "sit" : "sleep",
        x: 0,
        jump: 0,
      };
    }
    case "outro": {
      const progress = ms / timing.outroDurationMs;
      return {
        pose: progress < 0.25 ? "sit" : progress < 0.45 ? "crouch" : "leap",
        x: END_X * progress * progress,
        jump: Math.sin(Math.PI * progress) * 0.7,
      };
    }
    case "done":
      return { pose: "sit", x: END_X, jump: 0 };
  }
}

/** The side-view calico: smooths between poses, and owns its blink, ear-flick and tail motion. */
class CalicoCat {
  private pose: CatPoseName = "sleep";
  private readonly current: CatPoseParams = { ...POSES.sleep };
  private x = START_X;
  private jump = 0;
  private time = 0;
  private blinkCountdown = 2;
  private blink = 0;
  private eyeOpen = 0;
  private earCountdown = 3;
  private ear = 0;

  update(dt: number, time: number, target: CatTarget): void {
    this.time = time;
    this.x = target.x;
    this.jump = target.jump;

    // Stretch blends slower, so the cat eases into and out of it.
    const blending =
      target.pose === "stretch" || this.pose === "stretch" ? 0.5 : 0.15;
    const easing = 1 - Math.exp(-dt / blending);
    const targetPose = POSES[target.pose];
    for (const key of POSE_KEYS) {
      this.current[key] += (targetPose[key] - this.current[key]) * easing;
    }
    this.pose = target.pose;

    this.blinkCountdown -= dt;
    if (this.blinkCountdown < 0) {
      this.blink = 0.14;
      this.blinkCountdown = 2 + Math.random() * 4;
    }
    this.blink -= dt;
    this.eyeOpen = this.current.eye * (this.blink > 0 ? 0.08 : 1);

    this.earCountdown -= dt;
    if (this.earCountdown < 0) {
      this.ear = 0.3;
      this.earCountdown = 3 + Math.random() * 5;
    }
    this.ear = Math.max(0, this.ear - dt);
  }

  draw(ctx: CanvasContext): void {
    const pose = this.current;

    ctx.save();
    ctx.translate(SCENE_CENTER_X, SCENE_GROUND_Y);
    ctx.scale(CAT_SCALE, CAT_SCALE);

    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - this.jump * 0.8);
    fillEllipse(ctx, this.x, 3, 78, 8, SHADOW);
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, -(pose.by + this.jump) * BODY_LIFT);
    ctx.rotate(-pose.pitch * DEGREES * RAD);
    ctx.scale(1, 1 + Math.sin(this.time * 2.2) * pose.breath);
    this.drawCat(ctx, pose);
    ctx.restore();

    ctx.restore();

    this.drawSleepZs(ctx);
  }

  private drawCat(ctx: CanvasContext, pose: CatPoseParams): void {
    for (let index = 0; index < HIPS.length; index++) {
      this.drawLeg(ctx, pose, index, HIPS[index]!);
    }
    this.drawTail(ctx, pose);

    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 34, 0, 0, TAU);
    ctx.fillStyle = WHITE;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 34, 0, 0, TAU);
    ctx.clip();
    fillEllipse(ctx, -24, -22, 26, 16, ORANGE);
    fillEllipse(ctx, -47, -2, 14, 26, BLACK);
    fillEllipse(ctx, 14, -31, 22, 11, ORANGE);
    fillEllipse(ctx, -4, -30, 9, 10, BLACK);
    fillEllipse(ctx, -30, 22, 9, 8, ORANGE);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 34, 0, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    const nod = Math.sin(this.time * 0.9) * 0.03 * (pose.eye > 0.5 ? 1 : 0);
    ctx.save();
    ctx.translate(38, -20 + (pose.by < 0.6 ? 6 : 0));
    ctx.rotate((pose.pitch - pose.head + nod) * DEGREES * RAD);
    this.drawHead(ctx);
    ctx.restore();
  }

  private drawLeg(
    ctx: CanvasContext,
    pose: CatPoseParams,
    index: number,
    hip: readonly [number, number],
  ): void {
    const [hipX, hind] = hip;
    const scale = hind ? pose.hS : pose.fS;
    const angle = pose.pitch - (hind ? 0 : pose.reach);
    const footX = hipX - Math.sin(angle) * 48 * scale;
    const footY = 14 + Math.cos(angle) * 48 * scale;
    const kneeX = (hipX + footX) / 2;
    const kneeY = (14 + footY) / 2;
    const leg = [
      [hipX, 14],
      [kneeX, kneeY],
      [footX, footY],
    ] as const;

    strokePolyline(ctx, leg, 15, OUTLINE);
    strokePolyline(ctx, leg, 8, index % 2 === 0 ? WHITE_FAR : WHITE);

    ctx.save();
    ctx.translate(footX + 3, footY);
    ctx.rotate(pose.pitch * DEGREES * RAD);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5, 6, 0, 0, TAU);
    ctx.fillStyle = WHITE;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.restore();
  }

  private drawTail(ctx: CanvasContext, pose: CatPoseParams): void {
    let x = -48;
    let y = -8;
    let angle = 0;
    const points: [number, number][] = [[x, y]];
    for (let i = 0; i < 7; i++) {
      angle +=
        pose.tBase / 6 +
        (Math.sin(this.time * 2.2 - i * 0.6) * pose.tAmp * 0.18 * (i + 1)) / 7;
      x -= Math.cos(angle) * 13;
      y -= Math.sin(angle) * 13;
      points.push([x, y]);
    }

    strokePolyline(ctx, points, 15, OUTLINE);
    strokePolyline(ctx, points, 8, BROWN);
    strokePolyline(ctx, points.slice(0, 4), 8, ORANGE);
  }

  private drawHead(ctx: CanvasContext): void {
    const kick =
      this.ear > 0 ? Math.sin((this.ear / 0.3) * Math.PI * 3) * 0.25 : 0;
    ctx.save();
    ctx.translate(-20, -30);
    ctx.rotate(-kick * DEGREES * RAD);
    ctx.translate(20, 30);
    drawEar(
      ctx,
      [
        [-40, -14],
        [-34, -52],
        [-6, -32],
      ],
      BLACK,
      [
        [-33, -26],
        [-31, -42],
        [-18, -33],
      ],
    );
    ctx.restore();
    drawEar(
      ctx,
      [
        [40, -14],
        [34, -52],
        [6, -32],
      ],
      BROWN,
      [
        [33, -26],
        [31, -42],
        [18, -33],
      ],
    );

    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 38, 0, 0, TAU);
    ctx.fillStyle = WHITE;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 38, 0, 0, TAU);
    ctx.clip();
    fillEllipse(ctx, -34, -8, 22, 27, BLACK);
    fillEllipse(ctx, 14, -27, 28, 15, ORANGE);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 38, 0, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.85;
    fillEllipse(ctx, -33, 16, 9, 5.5, PINK);
    fillEllipse(ctx, 33, 16, 9, 5.5, PINK);
    ctx.restore();

    for (const side of [-1, 1]) this.drawEye(ctx, side * 17);

    ctx.beginPath();
    ctx.moveTo(-3.5, 10);
    ctx.lineTo(3.5, 10);
    ctx.lineTo(0, 14.5);
    ctx.closePath();
    ctx.fillStyle = NOSE;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.quadraticCurveTo(-3.5, 20, -7, 17);
    ctx.moveTo(0, 15);
    ctx.quadraticCurveTo(3.5, 20, 7, 17);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    this.drawWhiskers(ctx);
  }

  private drawEye(ctx: CanvasContext, x: number): void {
    if (this.eyeOpen < 0.25) {
      ctx.beginPath();
      ctx.moveTo(x - 9, 5);
      ctx.quadraticCurveTo(x, 13, x + 9, 5);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.translate(x, 2);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fillStyle = IRIS;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.translate(
      Math.sin(this.time * 0.6) * 2.2,
      Math.sin(this.time * 0.4) * 1.2,
    );
    ctx.beginPath();
    ctx.arc(0, 0, 8.2, 0, TAU);
    ctx.fillStyle = PUPIL;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3.4, -4, 3.6, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-3, 3.5, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawWhiskers(ctx: CanvasContext): void {
    const sway = Math.sin(this.time * 1.3) * 2;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 44, 6);
      ctx.rotate((side < 0 ? sway : -sway) * DEGREES * RAD);
      ctx.translate(-side * 44, -6);
      ctx.beginPath();
      for (const [dy, ey] of [
        [-2, -6],
        [3, 0],
        [8, 5],
      ] as const) {
        ctx.moveTo(side * 44, 6 + dy);
        ctx.lineTo(side * 68, 6 + ey * 1.4 - 2);
      }
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawSleepZs(ctx: CanvasContext): void {
    if (this.pose !== "sleep") return;
    const sleeping = Math.max(0, 1 - this.current.eye * 2);
    if (sleeping <= 0.01) return;

    ctx.save();
    ctx.fillStyle = SLEEP_Z;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (let i = 0; i < ZS.length; i++) {
      const z = ZS[i]!;
      const opacity =
        sleeping * (0.5 + 0.5 * Math.sin(this.time * 1.6 - i * 0.9));
      if (opacity <= 0.01) continue;
      ctx.globalAlpha = opacity;
      ctx.font = `700 ${z[2]}px sans-serif`;
      ctx.fillText(i === 2 ? "Z" : "z", z[0], z[1]);
    }
    ctx.restore();
  }
}

function strokePolyline(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  width: number,
  color: string,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawEar(
  ctx: CanvasContext,
  outer: readonly (readonly [number, number])[],
  color: string,
  inner: readonly (readonly [number, number])[],
): void {
  drawPolygon(ctx, outer, color, OUTLINE, 4);
  drawPolygon(ctx, inner, EAR_PINK);
}

function drawPolygon(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  fill: string,
  stroke?: string,
  lineWidth = 0,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [x, y] of rest) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (!stroke) return;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/**
 * The side-view calico of the TV scene: leaps in and sits down once, then sleeps 10 s and stands up
 * to stretch in a loop, until exit() is called, then leaps out to the right once.
 */
export class CalicoCatAnimation extends BaseAnimation<CanvasContext> {
  private readonly timing: CalicoTimingConfig;
  private readonly cat = new CalicoCat();
  private lastElapsedMs = -1;

  constructor(timing: CalicoTimingConfig = DEFAULT_CALICO_TIMING) {
    super(timing.introJumpMs + timing.introSettleMs, timing.outroDurationMs);
    this.timing = timing;
  }

  protected override draw(
    frame: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    const delta =
      this.lastElapsedMs < 0
        ? 0
        : Math.min(
            0.05,
            Math.max(0, (frame.elapsedMs - this.lastElapsedMs) / 1000),
          );
    this.lastElapsedMs = frame.elapsedMs;

    this.cat.update(
      delta,
      frame.elapsedMs / 1000,
      calicoTarget(state, this.timing),
    );
    this.cat.draw(frame.ctx);
  }
}
