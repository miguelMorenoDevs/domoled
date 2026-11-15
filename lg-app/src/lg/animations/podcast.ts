import type {
  AnimationFrame,
  AnimationPhaseState,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { DEFAULT_CD_TIMING } from "../../../../src/animator/timing.js";
import { roundRect } from "../../utils/canvas.js";
import {
  FALLBACK_PALETTE,
  artPalette,
  rgba,
  sampleDominantColor,
} from "../../utils/color.js";

// Scene geometry of the reference cover, in the 400x225 stage units.
const CENTER_X = 200;
const CENTER_Y = 88;
const COVER_SIZE = 88;
const COVER_RADIUS = 16;
const ART_SIZE = 84;
const ART_RADIUS = 14;
const BORDER_SIZE = 86;
const BORDER_RADIUS = 15.5;
const BADGE_X = 38;
const BADGE_Y = 38;
const BADGE_RADIUS = 12;
const BARS = 17;
const BAR_WIDTH = 4;
const BAR_SPACING = 7.5;
const BAR_BASE_Y = 76;
const PROGRESS_HALF_WIDTH = 60;
const PROGRESS_Y = 88;
const PROGRESS_HEIGHT = 2.5;
const RING_COUNT = 3;
const COVER_BACK = "#0b1626";
const TAU = Math.PI * 2;

function easeOutBack(progress: number): number {
  return 1 + 2 * Math.pow(progress - 1, 3) + Math.pow(progress - 1, 2);
}

/**
 * A podcast episode in the TV scene: the square artwork with a mic badge, broadcast squares rippling
 * out, speech bars bouncing under it and the episode's progress line. It pops in, floats, and shrinks
 * away during the outro; the artwork tints the rim, bars and rings. At the end of the episode it holds
 * its last frame until the poller calls exit().
 */
export class PodcastAnimation extends BaseAnimation<CanvasContext> {
  private readonly art: HTMLImageElement;
  private readonly durationMs: number;
  private readonly palette: ArtPalette;

  constructor(track: TrackData, art: HTMLImageElement) {
    super(
      DEFAULT_CD_TIMING.introDurationMs,
      DEFAULT_CD_TIMING.outroDurationMs,
      track.durationMs,
    );
    this.art = art;
    this.durationMs = track.durationMs;
    this.palette = artPalette(sampleDominantColor(art)) ?? FALLBACK_PALETTE;
  }

  protected override draw(
    { ctx, elapsedMs }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    const presence = this.presenceAt(state);
    if (presence <= 0.001) return;

    const seconds = elapsedMs / 1000;
    const alpha = Math.min(1, presence * 1.6);
    const gate = Math.min(
      1,
      Math.max(
        0.15,
        0.55 +
          0.5 * Math.sin(seconds * 1.7) +
          0.3 * Math.sin(seconds * 2.9 + 1),
      ),
    );
    const scale = easeOutBack(presence);

    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y + Math.sin(seconds * 1.4) * 2);
    ctx.scale(scale, scale);
    this.drawRings(ctx, seconds, alpha);
    this.drawCover(ctx, seconds, gate, alpha);
    this.drawBadge(ctx, seconds, gate, alpha);
    this.drawBars(ctx, seconds, gate, alpha);
    this.drawProgress(ctx, elapsedMs, alpha);
    ctx.restore();
  }

  /** 0 = gone, 1 = fully shown. Pops in through the intro and shrinks away through the outro. */
  private presenceAt(state: AnimationPhaseState): number {
    if (state.phase === "intro") {
      return state.elapsedInPhaseMs / DEFAULT_CD_TIMING.introDurationMs;
    }
    if (state.phase === "outro") {
      return 1 - state.elapsedInPhaseMs / DEFAULT_CD_TIMING.outroDurationMs;
    }
    return 1;
  }

  private drawRings(ctx: CanvasContext, seconds: number, alpha: number): void {
    ctx.save();
    for (let i = 0; i < RING_COUNT; i++) {
      const progress = (((seconds / 1.6 + i / 3) % 1) + 1) % 1;
      const size = COVER_SIZE + progress * 80;
      roundRect(
        ctx,
        -size / 2,
        -size / 2,
        size,
        size,
        COVER_RADIUS + progress * 30,
      );
      ctx.lineWidth = 0.6 + 2.2 * (1 - progress);
      ctx.strokeStyle = rgba(
        i % 2 ? this.palette.opposite : this.palette.main,
        1,
      );
      ctx.globalAlpha = (1 - progress) * 0.5 * alpha;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCover(
    ctx: CanvasContext,
    seconds: number,
    gate: number,
    alpha: number,
  ): void {
    const pulse = 1 + 0.02 * gate * Math.abs(Math.sin(seconds * 6));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(pulse, pulse);

    roundRect(
      ctx,
      -COVER_SIZE / 2,
      -COVER_SIZE / 2,
      COVER_SIZE,
      COVER_SIZE,
      COVER_RADIUS,
    );
    ctx.fillStyle = COVER_BACK;
    ctx.fill();

    ctx.save();
    roundRect(
      ctx,
      -ART_SIZE / 2,
      -ART_SIZE / 2,
      ART_SIZE,
      ART_SIZE,
      ART_RADIUS,
    );
    ctx.clip();
    this.drawArt(ctx);
    ctx.restore();

    roundRect(
      ctx,
      -BORDER_SIZE / 2,
      -BORDER_SIZE / 2,
      BORDER_SIZE,
      BORDER_SIZE,
      BORDER_RADIUS,
    );
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.rainbow(ctx, -BORDER_SIZE / 2, BORDER_SIZE / 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBadge(
    ctx: CanvasContext,
    seconds: number,
    gate: number,
    alpha: number,
  ): void {
    const pulse = 1 + 0.12 * gate * Math.abs(Math.sin(seconds * 8));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(BADGE_X, BADGE_Y);
    ctx.scale(pulse, pulse);

    ctx.beginPath();
    ctx.arc(0, 0, BADGE_RADIUS, 0, TAU);
    ctx.fillStyle = rgba(this.palette.deep, 1);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    roundRect(ctx, -3, -7, 6, 9, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -1, 6, 0, Math.PI);
    ctx.moveTo(0, 5);
    ctx.lineTo(0, 9);
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.restore();
  }

  private drawBars(
    ctx: CanvasContext,
    seconds: number,
    gate: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.rainbow(
      ctx,
      -PROGRESS_HALF_WIDTH,
      PROGRESS_HALF_WIDTH,
    );
    for (let i = 0; i < BARS; i++) {
      const amplitude =
        Math.abs(Math.sin(seconds * 7 + i * 0.9)) * 0.6 +
        Math.abs(Math.sin(seconds * 11 + i * 1.7)) * 0.4;
      const height = 3 + 24 * gate * amplitude;
      roundRect(
        ctx,
        (i - (BARS - 1) / 2) * BAR_SPACING - BAR_WIDTH / 2,
        BAR_BASE_Y - height,
        BAR_WIDTH,
        height,
        2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  private drawProgress(
    ctx: CanvasContext,
    elapsedMs: number,
    alpha: number,
  ): void {
    const progress =
      this.durationMs > 0
        ? Math.min(1, Math.max(0, elapsedMs / this.durationMs))
        : 0;
    const x = -PROGRESS_HALF_WIDTH + PROGRESS_HALF_WIDTH * 2 * progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineWidth = PROGRESS_HEIGHT;

    ctx.beginPath();
    ctx.moveTo(-PROGRESS_HALF_WIDTH, PROGRESS_Y);
    ctx.lineTo(PROGRESS_HALF_WIDTH, PROGRESS_Y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.stroke();

    if (progress > 0) {
      ctx.beginPath();
      ctx.moveTo(-PROGRESS_HALF_WIDTH, PROGRESS_Y);
      ctx.lineTo(x, PROGRESS_Y);
      ctx.strokeStyle = this.rainbow(
        ctx,
        -PROGRESS_HALF_WIDTH,
        PROGRESS_HALF_WIDTH,
      );
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, PROGRESS_Y, 3.5, 0, TAU);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }

  /** The cover's horizontal rim gradient: the artwork's main tone, a light tint and its opposite hue. */
  private rainbow(
    ctx: CanvasContext,
    from: number,
    to: number,
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(from, 0, to, 0);
    gradient.addColorStop(0, rgba(this.palette.main, 1));
    gradient.addColorStop(0.5, rgba(this.palette.light, 1));
    gradient.addColorStop(1, rgba(this.palette.opposite, 1));
    return gradient;
  }

  /** The square artwork, cropped to its centre so it fills the cover. */
  private drawArt(ctx: CanvasContext): void {
    const { art } = this;
    if (art.width <= 0 || art.height <= 0) return;
    const side = Math.min(art.width, art.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      art,
      (art.width - side) / 2,
      (art.height - side) / 2,
      side,
      side,
      -ART_SIZE / 2,
      -ART_SIZE / 2,
      ART_SIZE,
      ART_SIZE,
    );
  }
}
