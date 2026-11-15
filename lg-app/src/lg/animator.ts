import type { Animation } from "../../../src/animator/types.js";
import { AnimationRunner } from "../../../src/animator/runner.js";
import { ProfileBadge } from "./badge.js";
import { CalicoCatAnimation } from "./animations/calico.js";
import { CdAnimation } from "./animations/cd.js";
import { PodcastAnimation } from "./animations/podcast.js";
import { QrAnimation } from "./animations/qr.js";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  drawNightOverlay,
  drawScene,
} from "./scene.js";
import { wrapText } from "../utils/canvas.js";

// The scene is authored in 400x225 units and rendered at 1080p for the TV.
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const SCENE_SCALE = SCREEN_WIDTH / STAGE_WIDTH;
const FPS = 30;

/**
 * Same lifecycle as CdAnimator in src/led/animator.ts (shared AnimationRunner), drawing the meadow
 * scene and the animations on top of it at 1080p.
 */
export class LgAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasContext;
  private readonly runner = new AnimationRunner<CanvasContext>();
  private readonly badge = new ProfileBadge();
  private errorMessage = "";
  private intervalId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    this.ctx = canvas.getContext("2d")!;
    this.fitToWindow();
    window.addEventListener("resize", this.fitToWindow);
  }

  /** Renders at 1080p and scales the element to the window, so 4K panels get a full screen too. */
  private fitToWindow = (): void => {
    const factor = Math.min(
      window.innerWidth / SCREEN_WIDTH,
      window.innerHeight / SCREEN_HEIGHT,
    );
    this.canvas.style.width = `${Math.round(SCREEN_WIDTH * factor)}px`;
    this.canvas.style.height = `${Math.round(SCREEN_HEIGHT * factor)}px`;
  };

  setProfile(profile: Pick<SpotifyStatus, "displayName" | "avatarUrl">): void {
    this.badge.setProfile(profile);
  }

  play(art: HTMLImageElement, track: TrackData, positionMs: number): void {
    if (this.waitForExit(() => this.play(art, track, positionMs))) return;
    const animation =
      track.contentType === "episode"
        ? new PodcastAnimation(track, art)
        : new CdAnimation(track, art);
    this.run(animation, positionMs, () => this.startIdle());
  }

  /**
   * Freezes the running track's animation on its current frame. The screen keeps the last frame.
   */
  pause(): void {
    if (!this.runner.pause()) return;
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  /**
   * Continues a paused track's animation from where it stopped, without restarting the intro.
   */
  resume(): void {
    if (!this.runner.resume()) return;
    this.intervalId = window.setInterval(this.renderFrame, 1000 / FPS);
  }

  /**
   * Moves a playing or paused track's animation to `progressMs`, without restarting the intro.
   */
  seek(progressMs: number): void {
    const current = this.runner.current;
    if (
      !(current instanceof CdAnimation) &&
      !(current instanceof PodcastAnimation)
    )
      return;
    this.runner.seek(progressMs);
  }

  startIdle(): void {
    const current = this.runner.current;
    if (current instanceof CalicoCatAnimation && !current.exiting) return;
    if (this.waitForExit(() => this.startIdle())) return;
    this.run(new CalicoCatAnimation(), 0, null);
  }

  showQr(modules: boolean[][]): void {
    if (this.waitForExit(() => this.showQr(modules))) return;
    this.run(new QrAnimation(modules), 0, null);
  }

  showError(message: string): void {
    if (this.waitForExit(() => this.showError(message))) return;
    this.stop();
    this.errorMessage = message;
    this.intervalId = window.setInterval(this.renderErrorFrame, 1000 / FPS);
  }

  private stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.runner.clear();
    this.clearScreen("#000");
  }

  private waitForExit(next: () => void): boolean {
    // A paused outro would never finish, so a replaced track resumes playback first.
    this.resume();
    return this.runner.waitForExit(next);
  }

  private run(
    animation: Animation<CanvasContext>,
    progressOffsetMs: number,
    afterExit: (() => void) | null,
  ): void {
    this.stop();

    this.runner.start(animation, progressOffsetMs, afterExit);
    this.intervalId = window.setInterval(this.renderFrame, 1000 / FPS);
  }

  private clearScreen(color: string): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private stageTransform(): void {
    this.ctx.setTransform(SCENE_SCALE, 0, 0, SCENE_SCALE, 0, 0);
  }

  /** Local time of day, so the meadow follows the TV's clock. */
  private currentHour(): number {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  }

  /** Draws the meadow, lets the active animation draw over it, then lays the night tint on top. */
  private drawStageWith(animation: Animation<CanvasContext>): void {
    this.clearScreen("#000");
    this.stageTransform();
    const sky = drawScene(
      this.ctx,
      performance.now() / 1000,
      this.currentHour(),
    );
    animation.render({
      ctx: this.ctx,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      elapsedMs: this.runner.elapsedMs(),
    });
    drawNightOverlay(this.ctx, sky);
    this.badge.draw(this.ctx);
  }

  /**
   * Renders the failure screen over the dimmed meadow: a red ring with an X, and the reason underneath.
   */
  private renderErrorFrame = (): void => {
    const { ctx } = this;
    this.clearScreen("#000");
    this.stageTransform();
    const sky = drawScene(ctx, performance.now() / 1000, this.currentHour());
    drawNightOverlay(ctx, sky);

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    ctx.restore();

    const cx = STAGE_WIDTH / 2;
    const cy = STAGE_HEIGHT / 2 - 6;
    const radius = 40;
    const arm = radius * 0.5;

    ctx.strokeStyle = "#e5484d";
    ctx.shadowColor = "#e5484d";
    ctx.shadowBlur = 10;
    ctx.lineCap = "round";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.moveTo(cx - arm, cy - arm);
    ctx.lineTo(cx + arm, cy + arm);
    ctx.moveTo(cx + arm, cy - arm);
    ctx.lineTo(cx - arm, cy + arm);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    wrapText(ctx, this.errorMessage, STAGE_WIDTH * 0.8).forEach((line, i) =>
      ctx.fillText(line, cx, cy + radius + 14 + i * 16),
    );
    this.badge.draw(ctx);
  };

  /**
   * Renders one frame. When the animation finishes, the next content starts; a track that reached its
   * end keeps its last frame until the server replaces it.
   */
  private renderFrame = (): void => {
    const animation = this.runner.current;
    if (!animation) return;

    this.drawStageWith(animation);

    if (animation.holdsAt(this.runner.elapsedMs())) {
      this.pause();
      return;
    }
    if (!animation.finished) return;
    const next = this.runner.afterExit;
    this.stop();
    next?.();
  };
}
