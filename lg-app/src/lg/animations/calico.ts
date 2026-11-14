import type {
  AnimationFrame,
  AnimationPhaseState,
  CalicoTimingConfig,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CALICO_TIMING } from "../../../../src/animator/timing.js";
import { fillTriangle } from "../../utils/canvas.js";
import { lerp } from "../../utils/math.js";

const CAT_WHITE = "#f7f3ec";
const CAT_SHADE = "#e2d9c8";
const CAT_ORANGE = "#dc7f2c";
const CAT_BLACK = "#201a17";
const CAT_TAIL_SHEEN = "#5a4a40";
const CAT_PINK = "#e9a3a0";
const CAT_IRIS = "#8c5a2b";
const CAT_EYE = "#0e0b0a";
const CAT_RED = "#c93a2c";
const CAT_TAG = "#c8a35c";

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
export class CalicoCatAnimation extends BaseAnimation<CanvasContext> {
  private timing: CalicoTimingConfig;

  constructor(timing: CalicoTimingConfig = DEFAULT_CALICO_TIMING) {
    super(timing.introJumpMs + timing.introSettleMs, timing.outroDurationMs);
    this.timing = timing;
  }

  protected override draw(
    { ctx, width, elapsedMs }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    const breath = Math.sin(elapsedMs / 600) * 0.04;
    const pose = calicoPose(state, width, this.timing);
    drawCat(ctx, pose, breath);
  }
}

/**
 * Ellipse outline with a fixed, slightly irregular wobble, so fur patches look organic.
 */
function blobPath(
  ctx: CanvasContext,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble: number,
): void {
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(3 * a + 1) + 0.5 * Math.sin(5 * a + 2));
    const px = cx + rx * k * Math.cos(a);
    const py = cy + ry * k * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fillBlob(
  ctx: CanvasContext,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble: number,
  color: string,
): void {
  blobPath(ctx, cx, cy, rx, ry, wobble);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeLine(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  width: number,
  color: string,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [px, py] of rest) ctx.lineTo(px, py);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Photo pixel layout of the body and head; each part is posed by scaling this layout to the pose's ellipse.
const BODY_CX = 560;
const BODY_CY = 520;
const BODY_RX = 330;
const BODY_RY = 320;
const HEAD_CX = 700;
const HEAD_CY = 215;
const HEAD_SCALE_X = 6 / 215;
const HEAD_SCALE_Y = 5.6 / 140;

function bodyPath(ctx: CanvasContext): void {
  ctx.beginPath();
  ctx.moveTo(470, 250);
  ctx.bezierCurveTo(330, 220, 240, 340, 235, 520);
  ctx.bezierCurveTo(230, 680, 300, 800, 450, 810);
  ctx.bezierCurveTo(600, 820, 720, 760, 770, 640);
  ctx.bezierCurveTo(840, 560, 890, 460, 850, 330);
  ctx.bezierCurveTo(820, 260, 720, 230, 470, 250);
  ctx.closePath();
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

  const floorY = bodyY + bodyRy * 0.8;
  const pawX = headX + 1 + stretch * 4;

  // Tail: curls along the floor when lying down.
  ctx.beginPath();
  ctx.moveTo(bodyX - bodyRx * 0.8, bodyY + bodyRy * 0.3);
  ctx.quadraticCurveTo(
    lerpPose(x - 16, x - 18),
    lerpPose(44, 49) + y,
    lerpPose(x - 14, x - 17),
    lerpPose(30, 42) + y,
  );
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.strokeStyle = CAT_BLACK;
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = CAT_TAIL_SHEEN;
  ctx.stroke();

  // Hind paws: rounded white feet tucked under the body.
  fillBlob(ctx, bodyX - bodyRx * 0.55, floorY, 2.7, 1.8, 0.08, CAT_WHITE);
  fillBlob(ctx, bodyX + bodyRx * 0.5, floorY, 2.7, 1.8, 0.08, CAT_WHITE);

  // Body: shaded white fur with black and orange patches, clipped to the posed outline.
  ctx.save();
  ctx.translate(bodyX, bodyY);
  ctx.scale(bodyRx / BODY_RX, bodyRy / BODY_RY);
  ctx.translate(-BODY_CX, -BODY_CY);
  bodyPath(ctx);
  const shade = ctx.createRadialGradient(420, 420, 60, 560, 520, 360);
  shade.addColorStop(0, CAT_WHITE);
  shade.addColorStop(1, CAT_SHADE);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.clip();
  fillBlob(ctx, 410, 290, 130, 85, 0.15, CAT_BLACK);
  fillBlob(ctx, 440, 380, 70, 100, 0.2, CAT_ORANGE);
  fillBlob(ctx, 640, 690, 55, 40, 0.2, CAT_BLACK);
  fillBlob(ctx, 840, 330, 35, 60, 0.2, CAT_BLACK);
  ctx.restore();

  // Front leg: white with a soft shadow edge, from the shoulder to the paw.
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyRx * 0.4, bodyY + bodyRy * 0.1);
  ctx.quadraticCurveTo(pawX - 1, bodyY + bodyRy * 0.8, pawX, floorY);
  ctx.lineCap = "round";
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = CAT_SHADE;
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = CAT_WHITE;
  ctx.stroke();

  // Head: posed by scaling the photo layout, so ears, face and collar move with it.
  ctx.save();
  ctx.translate(headX, headY);
  ctx.scale(HEAD_SCALE_X, HEAD_SCALE_Y);
  ctx.translate(-HEAD_CX, -HEAD_CY);

  fillTriangle(
    ctx,
    [
      [480, 160],
      [505, 40],
      [625, 120],
    ],
    CAT_BLACK,
  );
  fillTriangle(
    ctx,
    [
      [735, 120],
      [805, 0],
      [865, 150],
    ],
    CAT_BLACK,
  );
  fillTriangle(
    ctx,
    [
      [780, 110],
      [805, 35],
      [838, 135],
    ],
    CAT_PINK,
  );

  ctx.save();
  blobPath(ctx, HEAD_CX, HEAD_CY, 215, 140, 0.02);
  ctx.fillStyle = CAT_WHITE;
  ctx.fill();
  ctx.clip();
  fillBlob(ctx, 700, 110, 120, 50, 0.15, CAT_ORANGE);
  fillBlob(ctx, 555, 150, 85, 65, 0.15, CAT_BLACK);
  fillBlob(ctx, 840, 160, 55, 65, 0.15, CAT_BLACK);
  ctx.restore();

  const eyes: [number, number][] = [
    [610, 245],
    [770, 228],
  ];
  for (const [ex, ey] of eyes) {
    if (eyesClosed) {
      strokeLine(
        ctx,
        [
          [ex - 30, ey],
          [ex, ey + 20],
          [ex + 30, ey],
        ],
        8,
        CAT_EYE,
      );
    } else {
      fillBlob(ctx, ex, ey, 26, 28, 0.05, CAT_IRIS);
      fillBlob(ctx, ex + 3, ey, 12, 22, 0, CAT_EYE);
      fillBlob(ctx, ex + 10, ey - 10, 6, 6, 0, "#ffffff");
    }
  }

  fillBlob(ctx, 715, 300, 22, 16, 0.1, CAT_PINK);
  strokeLine(
    ctx,
    [
      [745, 305],
      [860, 285],
    ],
    4,
    "rgba(255, 255, 255, 0.7)",
  );
  strokeLine(
    ctx,
    [
      [745, 322],
      [860, 338],
    ],
    4,
    "rgba(255, 255, 255, 0.7)",
  );

  strokeLine(
    ctx,
    [
      [665, 372],
      [720, 392],
      [790, 366],
    ],
    22,
    CAT_RED,
  );
  fillBlob(ctx, 778, 410, 22, 26, 0, CAT_TAG);
  ctx.restore();

  // Paw: white, resting on the floor and reaching forward while stretching.
  fillBlob(ctx, pawX, floorY, 2.3, 1.5, 0.1, CAT_WHITE);
}
