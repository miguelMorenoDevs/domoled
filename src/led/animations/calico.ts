import type {
  AnimationFrame,
  CalicoTimingConfig,
  LedAnimation,
} from "../types.js";

export const DEFAULT_CALICO_TIMING: CalicoTimingConfig = {
  introJumpMs: 1200,
  introSettleMs: 700,
  lickPeriodMs: 800,
  outroDurationMs: 1200,
};

export type CalicoPhase = "intro" | "loop" | "outro" | "done";

export interface CalicoPhaseState {
  phase: CalicoPhase;
  elapsedInPhaseMs: number;
}

const CAT_WHITE = "#f5f1ea";
const CAT_ORANGE = "#e8892b";
const CAT_BLACK = "#1c1c1c";
const CAT_TONGUE = "#ff4f7b";

type CanvasContext = AnimationFrame["ctx"];

interface CatPose {
  x: number;
  jump: number;
  lie: number;
  lick: number;
  eyesClosed: boolean;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function fillEllipse(
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

function fillTriangle(
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

/**
 * Maps time since the cat appeared to its phase: intro once, loop until exitAtMs,
 * outro once after exitAtMs, then done. exitAtMs is null while the cat stays.
 */
export function calicoPhaseAt(
  elapsedMs: number,
  exitAtMs: number | null,
  timing: CalicoTimingConfig,
): CalicoPhaseState {
  if (exitAtMs !== null && elapsedMs >= exitAtMs) {
    const outroMs = elapsedMs - exitAtMs;
    if (outroMs < timing.outroDurationMs) {
      return { phase: "outro", elapsedInPhaseMs: outroMs };
    }
    return { phase: "done", elapsedInPhaseMs: 0 };
  }

  const introMs = timing.introJumpMs + timing.introSettleMs;
  if (elapsedMs < introMs)
    return { phase: "intro", elapsedInPhaseMs: elapsedMs };
  return { phase: "loop", elapsedInPhaseMs: elapsedMs - introMs };
}

function calicoPose(
  state: CalicoPhaseState,
  width: number,
  timing: CalicoTimingConfig,
): CatPose {
  const center = width / 2;
  const { elapsedInPhaseMs: ms } = state;

  switch (state.phase) {
    case "intro": {
      if (ms < timing.introJumpMs) {
        const progress = ms / timing.introJumpMs;
        return {
          x: lerp(6, center, progress),
          jump: Math.sin(Math.PI * progress) * 16,
          lie: 0,
          lick: 0,
          eyesClosed: false,
        };
      }
      const progress = (ms - timing.introJumpMs) / timing.introSettleMs;
      return {
        x: center,
        jump: 0,
        lie: 1 - Math.pow(1 - progress, 2),
        lick: 0,
        eyesClosed: progress >= 0.5,
      };
    }
    case "loop":
      return {
        x: center,
        jump: 0,
        lie: 1,
        lick: Math.max(0, Math.sin((2 * Math.PI * ms) / timing.lickPeriodMs)),
        eyesClosed: true,
      };
    case "outro": {
      const progress = ms / timing.outroDurationMs;
      return {
        x: lerp(center, width + 12, progress * progress),
        jump: Math.sin(Math.PI * progress) * 16,
        lie: Math.max(0, 1 - progress * 4),
        lick: 0,
        eyesClosed: false,
      };
    }
    case "done":
      return { x: width + 12, jump: 0, lie: 0, lick: 0, eyesClosed: false };
  }
}

/**
 * The calico cat: jumps in from the left and lies down once, licks its front leg until
 * exit() is called, then opens its eyes and jumps out to the right once.
 */
export class CalicoCatAnimation implements LedAnimation {
  private timing: CalicoTimingConfig;
  private exitAtMs: number | null = null;
  private phase: CalicoPhase = "intro";

  constructor(timing: CalicoTimingConfig = DEFAULT_CALICO_TIMING) {
    this.timing = timing;
  }

  get exiting(): boolean {
    return this.exitAtMs !== null;
  }

  get finished(): boolean {
    return this.phase === "done";
  }

  /** Starts the outro after the current loop; during the intro it waits for the intro to finish. */
  exit(elapsedMs: number): void {
    if (this.exitAtMs !== null) return;
    const introMs = this.timing.introJumpMs + this.timing.introSettleMs;
    this.exitAtMs = Math.max(elapsedMs, introMs);
  }

  render({ ctx, width, elapsedMs }: AnimationFrame): void {
    const state = calicoPhaseAt(elapsedMs, this.exitAtMs, this.timing);
    this.phase = state.phase;
    if (state.phase === "done") return;

    const breath = Math.sin(elapsedMs / 600) * 0.04;
    const pose = calicoPose(state, width, this.timing);
    drawCat(ctx, pose, breath);
  }
}

function drawCat(ctx: CanvasContext, pose: CatPose, breath: number): void {
  const { x, lie, lick, eyesClosed } = pose;
  const y = -pose.jump;
  const lerpPose = (standing: number, lying: number) =>
    lerp(standing, lying, lie);

  // Body: upright oval when standing, flat loaf when lying.
  const bodyX = lerpPose(x - 1, x);
  const bodyY = lerpPose(40, 44) + y;
  const bodyRx = lerpPose(9, 13);
  const bodyRy = lerpPose(8, 4.5) * (1 + breath);

  // Head: rests on the front paws and tilts down while licking.
  const headX = lerpPose(x + 8, x + 13) + lick * 1;
  const headY = lerpPose(31, 42) + y + lick * 2;
  const headR = 5.5;

  // Tail: curls along the floor when lying down.
  ctx.beginPath();
  ctx.moveTo(bodyX - bodyRx * 0.8, bodyY + bodyRy * 0.3);
  ctx.quadraticCurveTo(
    lerpPose(x - 16, x - 18),
    lerpPose(44, 49) + y,
    lerpPose(x - 14, x - 17),
    lerpPose(30, 42) + y,
  );
  ctx.lineWidth = 3;
  ctx.strokeStyle = CAT_ORANGE;
  ctx.lineCap = "round";
  ctx.stroke();

  // Back legs: two stubs at the floor, tucked under the body.
  const floorY = bodyY + bodyRy * 0.8;
  fillEllipse(ctx, bodyX - bodyRx * 0.6, floorY, 2.2, 2.2, CAT_WHITE);
  fillEllipse(ctx, bodyX + bodyRx * 0.5, floorY, 2.2, 2.2, CAT_WHITE);

  // Body with calico patches clipped to its outline.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(bodyX, bodyY, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = CAT_WHITE;
  ctx.fill();
  ctx.clip();
  fillEllipse(ctx, bodyX - 4, bodyY - 1, 5, 4.5, CAT_ORANGE);
  fillEllipse(ctx, bodyX + 4, bodyY - 2, 3, 3, CAT_BLACK);
  fillEllipse(ctx, bodyX + 9, bodyY + 1, 2.5, 2, CAT_ORANGE);
  ctx.restore();

  // Ears behind the head.
  fillTriangle(
    ctx,
    [
      [headX - 4, headY - 3],
      [headX - 5, headY - 9],
      [headX - 1, headY - 4],
    ],
    CAT_ORANGE,
  );

  // Head with calico cap and cheek patch.
  ctx.save();
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = CAT_WHITE;
  ctx.fill();
  ctx.clip();
  fillEllipse(ctx, headX - 2, headY - 3, 3.5, 2.5, CAT_ORANGE);
  fillEllipse(ctx, headX - 2, headY + 2.5, 2, 1.5, CAT_BLACK);
  ctx.restore();

  // Front ear.
  fillTriangle(
    ctx,
    [
      [headX + 1, headY - 4],
      [headX + 2, headY - 10],
      [headX + 5, headY - 3],
    ],
    CAT_BLACK,
  );

  // Eye: a 2px closed dash or a 1x2px open dot, snapped to matrix pixels.
  const eyeX = Math.round(headX + 1);
  const eyeY = Math.round(headY - 1);
  ctx.fillStyle = CAT_BLACK;
  if (eyesClosed) {
    ctx.fillRect(eyeX, eyeY, 2, 1);
  } else {
    ctx.fillRect(eyeX, eyeY - 1, 1, 2);
  }

  // Front leg: orange, resting on the floor, raised to the mouth while licking.
  const pawX = lerp(headX + 1, headX + 3.5, lick);
  const pawY = lerp(floorY, headY + 4.5, lick);
  fillEllipse(ctx, pawX, pawY, 2.4, 1.8, CAT_ORANGE);

  // Tongue last so it sits on top of the raised leg, starting at the mouth on the head's edge.
  if (lick > 0.5) {
    fillEllipse(ctx, headX + 3, headY + 4, 1.3, 1.1, CAT_TONGUE);
  }
}
