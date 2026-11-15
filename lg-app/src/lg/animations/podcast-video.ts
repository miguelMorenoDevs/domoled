import type {
  AnimationFrame,
  AnimationPhaseState,
} from "../../../../src/animator/types.js";
import { BaseAnimation } from "../../../../src/animator/base.js";
import {
  artGradient,
  fillEllipse,
  roundRect,
  wrapText,
} from "../../utils/canvas.js";
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

// The two illustrated hosts of the reference's broadcast clip, with their own colours.
const HEAD_Y = 62;
const HOSTS = [
  { x: 62, skin: "#d8a47c", hair: "#2b2a2e", turn: 0 },
  { x: 162, skin: "#f1c9a5", hair: "#8b5a2b", turn: 1 },
] as const;
const MOUTH = "#7a2a2a";
const EYE = "#222222";

function easeOutBack(progress: number): number {
  return 1 + 2 * Math.pow(progress - 1, 3) + Math.pow(progress - 1, 2);
}

function easeInCubic(progress: number): number {
  return progress * progress * progress;
}

/**
 * A podcast episode from a video show: the projector screen drops from above playing the reference's
 * broadcast clip, with two hosts taking turns to talk, the episode title and its progress, sways while
 * it hangs, and rolls back up in the outro. Same screen and timing as the login QR; the clip is tinted
 * from the episode's palette. At the end of the episode it holds its last frame until exit().
 */
export class PodcastVideoAnimation extends BaseAnimation<CanvasContext> {
  private readonly title: string;
  private readonly durationMs: number;
  private readonly palette: ArtPalette;

  constructor(track: TrackData, art: HTMLImageElement) {
    super(INTRO_MS, OUTRO_MS, track.durationMs);
    this.title = track.title.trim();
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

  /** The clip, the episode title, the podcast badge and the progress bar, clipped to the screen. */
  private drawVideo(ctx: CanvasContext, elapsedMs: number): void {
    const { x, y, width, height } = VIDEO;
    const seconds = elapsedMs / 1000;

    ctx.save();
    roundRect(ctx, x, y, width, height, VIDEO.radius);
    ctx.clip();
    ctx.translate(x, y);

    this.drawClip(ctx, seconds);
    this.drawBadge(ctx);
    this.drawTitle(ctx);
    this.drawProgress(ctx, elapsedMs);

    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + 0.03 * Math.sin(seconds * 13) * Math.sin(seconds * 3)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private drawClip(ctx: CanvasContext, seconds: number): void {
    const backdrop = ctx.createLinearGradient(0, 0, 0, VIDEO.height);
    backdrop.addColorStop(0, rgba(this.palette.deep, 1));
    backdrop.addColorStop(1, rgba(this.palette.oppositeDeep, 1));
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, VIDEO.width, VIDEO.height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    fillEllipse(ctx, 62, 60, 46, 46, rgba(this.palette.main, 1));
    fillEllipse(ctx, 162, 60, 46, 46, rgba(this.palette.opposite, 1));
    ctx.restore();

    fillEllipse(ctx, 62, 116, 30, 26, rgba(this.palette.deep, 1));
    fillEllipse(ctx, 162, 116, 30, 26, rgba(this.palette.oppositeDeep, 1));

    // The hosts take turns every 3.2 s; only the talking one flaps its mouth.
    const turn = Math.floor(seconds / 3.2) % 2;
    for (const host of HOSTS) {
      this.drawHost(ctx, host, seconds, turn === host.turn);
    }
  }

  private drawHost(
    ctx: CanvasContext,
    host: (typeof HOSTS)[number],
    seconds: number,
    talking: boolean,
  ): void {
    const bob = talking
      ? Math.sin(seconds * 5 + host.turn) * 1.2
      : Math.sin(seconds * 1.5 + host.turn) * 0.6;

    ctx.save();
    ctx.translate(host.x, HEAD_Y + bob);

    ctx.fillStyle = host.skin;
    ctx.fillRect(-5, 12, 10, 16);

    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -2, 15, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = host.hair;
    ctx.fill();

    ctx.fillStyle = EYE;
    for (const eyeX of [-6, 6]) {
      ctx.beginPath();
      ctx.arc(eyeX, 1, 1.6, 0, TAU);
      ctx.fill();
    }

    const mouth = talking
      ? 1 + 3 * Math.abs(Math.sin(seconds * 9 + host.turn * 2))
      : 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 8, 4, mouth, 0, 0, TAU);
    ctx.fillStyle = MOUTH;
    ctx.fill();
    ctx.restore();
  }

  private drawBadge(ctx: CanvasContext): void {
    ctx.beginPath();
    ctx.arc(11, 11, 2.8, 0, TAU);
    ctx.fillStyle = rgba(this.palette.main, 1);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 7px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("PODCAST", 17, 12);
  }

  private drawTitle(ctx: CanvasContext): void {
    if (!this.title) return;
    const { width } = VIDEO;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 98, width, 20);

    ctx.fillStyle = "#ffffff";
    ctx.font = "8.5px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const lines = wrapText(ctx, this.title, width - 24).slice(0, 2);
    lines.forEach((line, i) =>
      ctx.fillText(line, width / 2, 111 - (lines.length - 1) * 4.5 + i * 9),
    );
  }

  private drawProgress(ctx: CanvasContext, elapsedMs: number): void {
    const { width, height } = VIDEO;
    const progress =
      this.durationMs > 0
        ? Math.min(1, Math.max(0, elapsedMs / this.durationMs))
        : 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(0, height - 4, width, 4);
    ctx.fillStyle = artGradient(ctx, 0, width, this.palette);
    ctx.fillRect(0, height - 4, width * progress, 4);
  }
}
