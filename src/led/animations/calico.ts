import type {
  AnimationFrame,
  AnimationPhaseState,
  CalicoTimingConfig,
  CanvasContext,
  CatPose,
} from "../types.js";
import { BaseLedAnimation } from "./base.js";
import { fillEllipse, fillTriangle } from "../../utils/canvas.js";
import { lerp } from "../../utils/math.js";

export const DEFAULT_CALICO_TIMING: CalicoTimingConfig = {
  introJumpMs: 1200,
  introSettleMs: 700,
  sleepMs: 10000,
  stretchMs: 4000,
  outroDurationMs: 1200,
};

const CAT_WHITE = "#f5f1ea";
const CAT_ORANGE = "#e8892b";
const CAT_BLACK = "#1c1c1c";

/**
 * Stand and stretch (each 0..1) at loopMs into the loop: the cat sleeps for sleepMs, then stands up,
 * stretches in the middle of stretchMs, and lies back down to sleep. The cycle repeats.
 */
export function standStretchAt(
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

function calicoPose(
  state: AnimationPhaseState,
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
          stretch: 0,
          eyesClosed: false,
        };
      }
      const progress = (ms - timing.introJumpMs) / timing.introSettleMs;
      return {
        x: center,
        jump: 0,
        lie: 1 - Math.pow(1 - progress, 2),
        stretch: 0,
        eyesClosed: progress >= 0.5,
      };
    }
    case "loop": {
      const { stand, stretch } = standStretchAt(ms, timing);
      return {
        x: center,
        jump: 0,
        lie: 1 - stand,
        stretch,
        eyesClosed: stand < 0.5,
      };
    }
    case "outro": {
      const progress = ms / timing.outroDurationMs;
      return {
        x: lerp(center, width + 12, progress * progress),
        jump: Math.sin(Math.PI * progress) * 16,
        lie: Math.max(0, 1 - progress * 4),
        stretch: 0,
        eyesClosed: false,
      };
    }
    case "done":
      return { x: width + 12, jump: 0, lie: 0, stretch: 0, eyesClosed: false };
  }
}

/**
 * The calico cat: jumps in from the left and lies down once, then sleeps 10 s and stands up to stretch in a loop, until
 * exit() is called, then opens its eyes and jumps out to the right once.
 */
export class CalicoCatAnimation extends BaseLedAnimation {
  private timing: CalicoTimingConfig;

  constructor(timing: CalicoTimingConfig = DEFAULT_CALICO_TIMING) {
    super(timing.introJumpMs + timing.introSettleMs, timing.outroDurationMs);
    this.timing = timing;
  }

  protected override draw(
    { ctx, width, elapsedMs }: AnimationFrame,
    state: AnimationPhaseState,
  ): void {
    const breath = Math.sin(elapsedMs / 600) * 0.04;
    const pose = calicoPose(state, width, this.timing);
    drawCat(ctx, pose, breath);
  }
}

function drawCat(ctx: CanvasContext, pose: CatPose, breath: number): void {
  const { x, lie, stretch, eyesClosed } = pose;
  const y = -pose.jump;
  const lerpPose = (standing: number, lying: number) =>
    lerp(standing, lying, lie);

  // Body: upright oval when standing, flat loaf when lying; rear lifts and lengthens while stretching.
  const bodyX = lerpPose(x - 1, x);
  const bodyY = lerpPose(40, 44) + y - stretch * 2;
  const bodyRx = lerpPose(9, 13) + stretch * 2;
  const bodyRy = lerpPose(8, 4.5) * (1 + breath);

  // Head: rests on the front paws, and dips forward while stretching.
  const headX = lerpPose(x + 8, x + 13) + stretch * 3;
  const headY = lerpPose(31, 42) + y + stretch * 4;
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

  // Front leg: a limb from the shoulder to the paw, so the paw stays attached while stretching.
  const pawX = headX + 1 + stretch * 4;
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyRx * 0.5, bodyY + bodyRy * 0.5);
  ctx.lineTo(pawX, floorY);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = CAT_ORANGE;
  ctx.stroke();

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

  // Paw: orange, resting on the floor and reaching forward while stretching.
  fillEllipse(ctx, pawX, floorY, 2.4, 1.8, CAT_ORANGE);
}
