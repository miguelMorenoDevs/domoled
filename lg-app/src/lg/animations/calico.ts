import type {
  AnimationFrame,
  AnimationPhaseState,
  CalicoTimingConfig,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CALICO_TIMING } from "../../../../src/animator/timing.js";
import { lerp } from "../../utils/math.js";

const CAT_WHITE = "#f7f3ec";
const CAT_ORANGE = "#dc7f2c";
const CAT_BLACK = "#201a17";
const CAT_PINK = "#e9a3a0";
const CAT_IRIS = "#a6cc82";
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
 * Closed smooth outline through the points (Catmull-Rom curves), so shapes have no visible corners or round blobs.
 */
function smoothPath(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
): void {
  const n = points.length;
  const at = (i: number): readonly [number, number] =>
    points[(i + n) % n] as readonly [number, number];
  ctx.beginPath();
  ctx.moveTo(at(0)[0], at(0)[1]);
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    );
  }
  ctx.closePath();
}

function fillSmooth(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  color: string,
): void {
  smoothPath(ctx, points);
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

const BODY_OUTLINE: readonly (readonly [number, number])[] = [
  [440, 250],
  [330, 290],
  [262, 400],
  [234, 560],
  [260, 700],
  [360, 800],
  [520, 826],
  [680, 800],
  [760, 700],
  [820, 600],
  [880, 500],
  [860, 380],
  [780, 270],
  [600, 232],
];
const HEAD_OUTLINE: readonly (readonly [number, number])[] = [
  [500, 210],
  [505, 165],
  [545, 125],
  [640, 113],
  [760, 113],
  [860, 125],
  [900, 165],
  [905, 220],
  [885, 290],
  [830, 338],
  [740, 354],
  [650, 350],
  [570, 322],
  [515, 272],
];

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

  // Tail: a curved brush, thick at the body and rounded at the tip, curling along the floor when lying down.
  const baseX = bodyX - bodyRx * 0.75;
  const baseY = bodyY + bodyRy * 0.35;
  const curlX = bodyX - bodyRx * 1.5;
  const curlY = bodyY + bodyRy * 0.9;
  const tipX = bodyX - bodyRx * 1.2;
  const tipY = bodyY - bodyRy * 0.2;
  const tailAt = (t: number): readonly [number, number] => {
    const u = 1 - t;
    return [
      u * u * baseX + 2 * u * t * curlX + t * t * tipX,
      u * u * baseY + 2 * u * t * curlY + t * t * tipY,
    ];
  };
  const tailSamples = [0, 0.25, 0.5, 0.75, 1];
  const tailWidths = [2.2, 1.9, 1.6, 1.3, 1];
  const tailEdges = tailSamples.map((t, i) => {
    const [ax, ay] = tailAt(Math.max(0, t - 0.01));
    const [bx, by] = tailAt(Math.min(1, t + 0.01));
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const [cx, cy] = tailAt(t);
    const w = tailWidths[i] ?? 0;
    return {
      top: [cx + nx * w, cy + ny * w] as const,
      bottom: [cx - nx * w, cy - ny * w] as const,
    };
  });
  smoothPath(ctx, [
    ...tailEdges.map((edge) => edge.top),
    ...tailEdges.map((edge) => edge.bottom).reverse(),
  ]);
  ctx.fillStyle = CAT_BLACK;
  ctx.fill();
  // Hind paws: pale feet tucked under the body.
  for (const hx of [bodyX - bodyRx * 0.55, bodyX + bodyRx * 0.5]) {
    fillSmooth(
      ctx,
      [
        [hx - 2.7, floorY],
        [hx - 1, floorY - 1.6],
        [hx + 2.5, floorY - 1],
        [hx + 2.9, floorY + 1],
        [hx, floorY + 1.8],
        [hx - 2.4, floorY + 1.2],
      ],
      CAT_WHITE,
    );
  }
  // Body: shaded white fur with black and orange patches, clipped to the posed outline.
  ctx.save();
  ctx.translate(bodyX, bodyY);
  ctx.scale(bodyRx / BODY_RX, bodyRy / BODY_RY);
  ctx.translate(-BODY_CX, -BODY_CY);
  smoothPath(ctx, BODY_OUTLINE);
  ctx.fillStyle = CAT_WHITE;
  ctx.fill();
  ctx.clip();
  fillSmooth(
    ctx,
    [
      [300, 240],
      [380, 214],
      [480, 224],
      [520, 280],
      [470, 302],
      [400, 316],
      [330, 300],
      [290, 270],
    ],
    CAT_BLACK,
  );
  fillSmooth(
    ctx,
    [
      [395, 300],
      [445, 285],
      [490, 320],
      [500, 380],
      [478, 450],
      [430, 480],
      [390, 440],
      [372, 370],
    ],
    CAT_ORANGE,
  );
  fillSmooth(
    ctx,
    [
      [600, 650],
      [660, 640],
      [690, 690],
      [670, 740],
      [620, 745],
      [590, 700],
    ],
    CAT_BLACK,
  );
  fillSmooth(
    ctx,
    [
      [815, 280],
      [855, 262],
      [872, 320],
      [860, 390],
      [825, 380],
      [810, 330],
    ],
    CAT_BLACK,
  );
  ctx.restore();

  // Front leg: white with a soft shadow edge, from the shoulder to the paw.
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyRx * 0.4, bodyY + bodyRy * 0.1);
  ctx.quadraticCurveTo(pawX - 1, bodyY + bodyRy * 0.8, pawX, floorY);
  ctx.lineCap = "round";
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = CAT_WHITE;
  ctx.stroke();

  // Head: posed by scaling the photo layout, so ears, face and collar move with it.
  ctx.save();
  ctx.translate(headX, headY);
  ctx.scale(HEAD_SCALE_X, HEAD_SCALE_Y);
  ctx.translate(-HEAD_CX, -HEAD_CY);

  fillSmooth(
    ctx,
    [
      [490, 180],
      [496, 125],
      [530, 80],
      [585, 95],
      [630, 130],
      [660, 170],
    ],
    CAT_BLACK,
  );
  fillSmooth(
    ctx,
    [
      [740, 170],
      [770, 95],
      [805, 52],
      [850, 75],
      [895, 125],
      [910, 175],
    ],
    CAT_BLACK,
  );
  fillSmooth(
    ctx,
    [
      [525, 150],
      [532, 118],
      [555, 105],
      [592, 125],
      [610, 150],
    ],
    CAT_PINK,
  );
  fillSmooth(
    ctx,
    [
      [765, 150],
      [782, 115],
      [806, 90],
      [836, 112],
      [856, 145],
      [812, 155],
    ],
    CAT_PINK,
  );

  smoothPath(ctx, HEAD_OUTLINE);
  ctx.fillStyle = CAT_WHITE;
  ctx.fill();
  ctx.save();
  ctx.clip();
  fillSmooth(
    ctx,
    [
      [610, 80],
      [700, 70],
      [790, 95],
      [780, 130],
      [700, 140],
      [630, 125],
    ],
    CAT_ORANGE,
  );
  fillSmooth(
    ctx,
    [
      [500, 200],
      [530, 130],
      [600, 110],
      [640, 150],
      [625, 200],
      [560, 230],
    ],
    CAT_BLACK,
  );
  fillSmooth(
    ctx,
    [
      [800, 100],
      [860, 130],
      [880, 200],
      [850, 220],
      [810, 190],
    ],
    CAT_BLACK,
  );
  ctx.restore();

  const eyes: [number, number][] = [
    [622, 238],
    [778, 238],
  ];
  for (const [ex, ey] of eyes) {
    if (eyesClosed) {
      fillSmooth(
        ctx,
        [
          [ex - 36, ey],
          [ex - 17, ey + 12],
          [ex, ey + 14],
          [ex + 17, ey + 12],
          [ex + 36, ey],
          [ex + 17, ey + 8],
          [ex, ey + 10],
          [ex - 17, ey + 8],
        ],
        CAT_EYE,
      );
    } else {
      // Round discs in head space: the head scale is not square, so y is stretched to look round on screen.
      const disc = (r: number, dx = 0, dy = 0): [number, number][] =>
        Array.from({ length: 8 }, (_, i): [number, number] => {
          const a = (i * Math.PI) / 4;
          return [
            ex + dx + r * Math.cos(a),
            ey + dy + r * (HEAD_SCALE_X / HEAD_SCALE_Y) * Math.sin(a),
          ];
        });
      fillSmooth(ctx, disc(28), CAT_IRIS);
      fillSmooth(ctx, disc(15), CAT_EYE);
      fillSmooth(ctx, disc(6, 7, -8), "#ffffff");
      fillSmooth(ctx, disc(2.5, -7, 6), "#ffffff");
    }
  }

  fillSmooth(
    ctx,
    [
      [690, 276],
      [710, 276],
      [706, 288],
      [700, 293],
      [694, 288],
    ],
    CAT_PINK,
  );
  for (const side of [-1, 1]) {
    strokeLine(
      ctx,
      [
        [700 + side * 42, 296],
        [700 + side * 150, 284],
      ],
      2.6,
      CAT_BLACK,
    );
    strokeLine(
      ctx,
      [
        [700 + side * 42, 306],
        [700 + side * 146, 312],
      ],
      2.6,
      CAT_BLACK,
    );
  }

  ctx.restore();

  // Collar: a band around the neck where the head meets the body, with the tag hanging below it.
  strokeLine(
    ctx,
    [
      [headX - 4.2, headY + 4.4],
      [headX - 0.4, headY + 6.2],
      [headX + 3.6, headY + 5],
    ],
    1.1,
    CAT_RED,
  );
  fillSmooth(
    ctx,
    [
      [headX + 0.6, headY + 6.6],
      [headX + 1.8, headY + 6.4],
      [headX + 2.2, headY + 7.8],
      [headX + 1.4, headY + 8.8],
      [headX + 0.6, headY + 7.9],
    ],
    CAT_TAG,
  );

  // Front paw, resting on the floor and reaching forward while stretching.
  fillSmooth(
    ctx,
    [
      [pawX - 2.6, floorY - 1.2],
      [pawX, floorY - 1.8],
      [pawX + 2.6, floorY - 0.8],
      [pawX + 2.4, floorY + 1.4],
      [pawX - 1.2, floorY + 1.8],
      [pawX - 2.8, floorY + 0.6],
    ],
    CAT_WHITE,
  );
}
