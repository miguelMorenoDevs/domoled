import type {
  AnimationFrame,
  AnimationPhaseState,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import { artGradient, drawCoverArt, roundRect } from "../../utils/canvas.js";
import {
  FALLBACK_PALETTE,
  artPalette,
  rgba,
  sampleDominantColor,
} from "../../utils/color.js";

const INTRO_MS = 1400;
const OUTRO_MS = 1000;
const DROP = 210;
const SCREEN_CENTER_X = 200;
const TAU = Math.PI * 2;

// The projector screen of the reference, in stage units.
const LEG_HALF_WIDTH = 88;
const TOP_BAR = { x: 68, y: -5, width: 264, height: 11, radius: 5.5 };
const PANEL = { x: 76, y: 6, width: 248, height: 150 };
const VIDEO = { x: 88, y: 16, width: 224, height: 126, radius: 3 };
const RAIL = { x: 76, y: 152, width: 248, height: 6, radius: 3 };
const STRING_BOTTOM_Y = 170;
const KNOB = { x: 200, y: 173, radius: 3.5 };

function easeOutBack(progress: number): number {
  return 1 + 2 * Math.pow(progress - 1, 3) + Math.pow(progress - 1, 2);
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

/**
 * A podcast episode from a video show: the projector screen drops from above with the episode's
 * artwork, a podcast badge and its progress, sways while it hangs, and rolls back up in the outro.
 * Same screen and timing as the login QR. At the end of the episode it holds its last frame until
 * the poller calls exit().
 */
export class PodcastVideoAnimation extends BaseAnimation<CanvasContext> {
  private readonly art: HTMLImageElement;
  private readonly durationMs: number;
  private readonly palette: ArtPalette;

  constructor(track: TrackData, art: HTMLImageElement) {
    super(INTRO_MS, OUTRO_MS, track.durationMs);
    this.art = art;
    this.durationMs = track.durationMs;
    this.palette = artPalette(sampleDominantColor(art)) ?? FALLBACK_PALETTE;
  }

  protected override draw(
    { ctx, elapsedMs }: AnimationFrame<CanvasContext>,
    state: AnimationPhaseState,
  ): void {
    ctx.save();
    ctx.translate(0, this.offsetAt(state, elapsedMs / 1000));
    this.drawScreen(ctx, elapsedMs);
    ctx.restore();
  }

  private offsetAt(state: AnimationPhaseState, seconds: number): number {
    switch (state.phase) {
      case "intro":
        return -DROP * (1 - easeOutBack(state.elapsedInPhaseMs / INTRO_MS));
      case "loop":
        return Math.sin(seconds * 1.1) * 0.8;
      case "outro":
        return -DROP * easeInCubic(state.elapsedInPhaseMs / OUTRO_MS);
      case "done":
        return -DROP;
    }
  }

  private drawScreen(ctx: CanvasContext, elapsedMs: number): void {
    ctx.beginPath();
    ctx.moveTo(SCREEN_CENTER_X - LEG_HALF_WIDTH, -300);
    ctx.lineTo(SCREEN_CENTER_X - LEG_HALF_WIDTH, 0);
    ctx.moveTo(SCREEN_CENTER_X + LEG_HALF_WIDTH, -300);
    ctx.lineTo(SCREEN_CENTER_X + LEG_HALF_WIDTH, 0);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#aab4bb";
    ctx.stroke();

    roundRect(
      ctx,
      TOP_BAR.x,
      TOP_BAR.y,
      TOP_BAR.width,
      TOP_BAR.height,
      TOP_BAR.radius,
    );
    ctx.fillStyle = "#8a949c";
    ctx.fill();

    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#dfe5e9";
    ctx.strokeRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height);

    this.drawVideo(ctx, elapsedMs);

    roundRect(ctx, RAIL.x, RAIL.y, RAIL.width, RAIL.height, RAIL.radius);
    ctx.fillStyle = "#aab4bb";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(SCREEN_CENTER_X, RAIL.y + RAIL.height);
    ctx.lineTo(SCREEN_CENTER_X, STRING_BOTTOM_Y);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#aab4bb";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(KNOB.x, KNOB.y, KNOB.radius, 0, TAU);
    ctx.fillStyle = "#c9a36a";
    ctx.fill();
  }

  /** The episode's artwork over a tinted backdrop, with the podcast badge and its progress bar. */
  private drawVideo(ctx: CanvasContext, elapsedMs: number): void {
    const { x, y, width, height } = VIDEO;
    ctx.save();
    roundRect(ctx, x, y, width, height, VIDEO.radius);
    ctx.clip();

    const backdrop = ctx.createLinearGradient(0, y, 0, y + height);
    backdrop.addColorStop(0, rgba(this.palette.deep, 1));
    backdrop.addColorStop(1, rgba(this.palette.oppositeDeep, 1));
    ctx.fillStyle = backdrop;
    ctx.fillRect(x, y, width, height);

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    drawCoverArt(ctx, this.art, height);
    ctx.restore();

    const progress =
      this.durationMs > 0
        ? Math.min(1, Math.max(0, elapsedMs / this.durationMs))
        : 0;
    const scrim = ctx.createLinearGradient(0, y + height - 20, 0, y + height);
    scrim.addColorStop(0, "rgba(0, 0, 0, 0)");
    scrim.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.fillStyle = scrim;
    ctx.fillRect(x, y + height - 20, width, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(x, y + height - 4, width, 4);
    ctx.fillStyle = artGradient(ctx, x, x + width, this.palette);
    ctx.fillRect(x, y + height - 4, width * progress, 4);

    roundRect(ctx, x + 6, y + 5, 46, 12, 6);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 13, y + 11, 2.8, 0, TAU);
    ctx.fillStyle = rgba(this.palette.main, 1);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 7px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("PODCAST", x + 19, y + 12);

    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + 0.03 * Math.sin((elapsedMs / 1000) * 13) * Math.sin((elapsedMs / 1000) * 3)})`;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }
}
