import type {
  AnimationFrame,
  AnimationPhaseState,
  CdTimingConfig,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CD_TIMING } from "../../../../src/animator/timing.js";
import { cdCurveAt } from "../../../../src/utils/cd-curve.js";

const PALETTE = ["#ff5db1", "#e0338f", "#4cc9d9", "#2a8fb5", "#f2c28b"];
const GLOW_CENTER = "rgba(224, 51, 143, 0.55)";
const GLOW_EDGE = "rgba(42, 143, 181, 0)";
const DISK_CENTER = "#2b3f5e";
const DISK_EDGE = "#0e1a2e";
const THUMB_BACK = "#0b1626";
const SPARKLE_GOLD = "#f2c28b";

// Scene geometry of the reference disc: a 70 unit radius, centred above the horizon.
const CENTER_X = 200;
const CENTER_Y = 105;
const RISE = 150;
const RADIUS = 70;
const THUMB_RADIUS = 42;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const PARTICLE_COUNT = 18;
const SPARKLE_COUNT = 8;

function randomBetween(from: number, to: number): number {
  return from + Math.random() * (to - from);
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * The spinning disc of the TV scene: a translucent CD with the album art in the middle, a rainbow
 * rim, a soft glow, expanding rings and orbiting flecks. It rises from below the meadow during the
 * intro and sinks back during the outro. At the end of the track it holds its last frame until the
 * poller calls exit().
 */
export class CdAnimation extends BaseAnimation<CanvasContext> {
  private readonly art: HTMLImageElement;
  private readonly timing: CdTimingConfig;
  private readonly particles: CdParticle[];
  private readonly sparkles: CdSparkle[];

  constructor(
    track: TrackData,
    art: HTMLImageElement,
    timing: CdTimingConfig = DEFAULT_CD_TIMING,
  ) {
    super(timing.introDurationMs, timing.outroDurationMs, track.durationMs);
    this.art = art;
    this.timing = timing;

    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: Math.random() * TAU,
      speed: randomBetween(0.1, 0.26),
      offset: Math.random(),
      radius: randomBetween(56, 66),
      travel: randomBetween(45, 85),
      size: randomBetween(1.5, 4),
      color: PALETTE[i % PALETTE.length]!,
    }));
    this.sparkles = Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
      angle: i * 0.785 + Math.random(),
      radius: randomBetween(78, 112),
      color: i % 2 ? "#ffffff" : SPARKLE_GOLD,
    }));
  }

  protected override draw(
    { ctx, elapsedMs }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    const seconds = elapsedMs / 1000;
    const { opacity, offscreen } = cdCurveAt(
      state,
      this.timing.introDurationMs,
      this.timing.outroDurationMs,
    );
    if (opacity <= 0.001) return;

    const risen = 1 - offscreen;
    const y =
      CENTER_Y + offscreen * RISE + Math.sin((seconds * TAU) / 1.8) * 3 * risen;
    const discScale = 1 + 0.015 * Math.sin((seconds * TAU) / 0.9) * risen;

    ctx.save();
    ctx.translate(CENTER_X, y);
    ctx.scale(discScale, discScale);

    this.drawGlow(ctx, opacity);
    this.drawRings(ctx, seconds, opacity);
    this.drawParticles(ctx, seconds, opacity);
    this.drawSparkles(ctx, seconds, opacity);
    this.drawDisc(ctx, seconds, opacity);

    ctx.restore();
  }

  private drawGlow(ctx: CanvasContext, opacity: number): void {
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 92);
    gradient.addColorStop(0, GLOW_CENTER);
    gradient.addColorStop(1, GLOW_EDGE);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawRings(
    ctx: CanvasContext,
    seconds: number,
    opacity: number,
  ): void {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const progress = (((seconds / 2.4 + i / 3) % 1) + 1) % 1;
      ctx.beginPath();
      ctx.arc(0, 0, 64 + progress * 50, 0, TAU);
      ctx.lineWidth = 0.6 + 2.4 * (1 - progress);
      ctx.strokeStyle = PALETTE[i % 2 ? 2 : 0]!;
      ctx.globalAlpha = (1 - progress) * 0.55 * opacity;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(
    ctx: CanvasContext,
    seconds: number,
    opacity: number,
  ): void {
    ctx.save();
    for (const particle of this.particles) {
      const progress = (seconds * particle.speed + particle.offset) % 1;
      const angle = particle.angle + seconds * 0.25;
      const radius = particle.radius + progress * particle.travel;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.9 - progress * 14;
      ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.85 * opacity;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, particle.size * (1 - 0.4 * progress), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSparkles(
    ctx: CanvasContext,
    seconds: number,
    opacity: number,
  ): void {
    ctx.save();
    for (let i = 0; i < this.sparkles.length; i++) {
      const sparkle = this.sparkles[i]!;
      const angle = sparkle.angle + seconds * 0.15;
      const scale = 2.5 + 3 * Math.abs(Math.sin(seconds * 2.2 + i));
      ctx.save();
      ctx.translate(
        Math.cos(angle) * sparkle.radius,
        Math.sin(angle) * sparkle.radius * 0.85,
      );
      ctx.scale(scale, scale);
      ctx.globalAlpha =
        opacity * (0.35 + 0.65 * Math.abs(Math.sin(seconds * 1.7 + i * 1.3)));
      ctx.fillStyle = sparkle.color;
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.quadraticCurveTo(0.15, -0.15, 1, 0);
      ctx.quadraticCurveTo(0.15, 0.15, 0, 1);
      ctx.quadraticCurveTo(-0.15, 0.15, -1, 0);
      ctx.quadraticCurveTo(-0.15, -0.15, 0, -1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawDisc(ctx: CanvasContext, seconds: number, opacity: number): void {
    ctx.save();
    ctx.rotate(seconds * 18 * DEG);

    ctx.save();
    ctx.globalAlpha = 0.3 + 0.45 * opacity;

    const body = ctx.createRadialGradient(0, 0, 0, 0, 0, RADIUS);
    body.addColorStop(0, DISK_CENTER);
    body.addColorStop(1, DISK_EDGE);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, RADIUS, 0, TAU);
    ctx.fill();

    const rim = ctx.createLinearGradient(-RADIUS, 0, RADIUS, 0);
    rim.addColorStop(0, "#ff5db1");
    rim.addColorStop(0.5, "#f2c28b");
    rim.addColorStop(1, "#4cc9d9");
    ctx.beginPath();
    ctx.arc(0, 0, RADIUS - 1, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rim;
    ctx.stroke();

    ctx.beginPath();
    for (const radius of [52, 57, 62, 66]) {
      ctx.moveTo(radius, 0);
      ctx.arc(0, 0, radius, 0, TAU);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 93, 177, 0.3)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(RADIUS, 0);
    ctx.arc(0, 0, RADIUS, 0, Math.PI / 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(76, 201, 217, 0.3)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-RADIUS, 0);
    ctx.arc(0, 0, RADIUS, Math.PI, Math.PI * 1.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = smoothstep(0.45, 1, opacity);
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fillStyle = THUMB_BACK;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, THUMB_RADIUS, 0, TAU);
    ctx.clip();
    this.drawArt(ctx);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, THUMB_RADIUS, 0, TAU);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fillStyle = THUMB_BACK;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private drawArt(ctx: CanvasContext): void {
    const { art } = this;
    if (art.width <= 0 || art.height <= 0) return;
    const side = Math.min(art.width, art.height);
    const sourceX = (art.width - side) / 2;
    const sourceY = (art.height - side) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      art,
      sourceX,
      sourceY,
      side,
      side,
      -THUMB_RADIUS,
      -THUMB_RADIUS,
      THUMB_RADIUS * 2,
      THUMB_RADIUS * 2,
    );
  }
}
