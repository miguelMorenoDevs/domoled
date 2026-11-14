import type { Animation } from "../../../src/animator/types.js";
import { AnimationRunner } from "../../../src/animator/runner.js";
import { CalicoCatAnimation } from "./animations/calico.js";
import { CdAnimation } from "./animations/cd.js";
import { PodcastAnimation } from "./animations/podcast.js";
import { wrapText } from "../utils/canvas.js";

// Animations draw in the LED matrix's 64x64 units; the screen scales them up to fill its height.
const MATRIX_SIZE = 64;
const FPS = 30;

/**
 * Same lifecycle as CdAnimator in src/led/animator.ts (shared AnimationRunner), drawing to a screen-sized canvas.
 */
export class LgAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasContext;
  private readonly runner = new AnimationRunner<CanvasContext>();
  private qrModules: boolean[][] = [];
  private errorMessage = "";
  private intervalId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext("2d")!;
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
    this.stop();
    this.qrModules = modules;
    this.intervalId = window.setInterval(this.renderQrFrame, 1000 / FPS);
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

  /**
   * Renders the login QR: white background, black modules, one quiet-zone module around the code.
   */
  private renderQrFrame = (): void => {
    const { ctx, canvas } = this;
    const size = this.qrModules.length;
    const side = Math.min(canvas.width, canvas.height);
    const cell = Math.floor(side / (size + 2));
    const offsetX = Math.floor((canvas.width - size * cell) / 2);
    const offsetY = Math.floor((canvas.height - size * cell) / 2);

    this.clearScreen("#fff");
    ctx.fillStyle = "#000";
    this.qrModules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) {
          ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
        }
      }),
    );
  };

  /**
   * Renders the failure screen: a red ring with an X, and the reason underneath.
   */
  private renderErrorFrame = (): void => {
    const { ctx, canvas } = this;
    const side = Math.min(canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - side * 0.1;
    const radius = side * 0.22;
    const arm = radius * 0.5;

    this.clearScreen("#000");
    ctx.strokeStyle = "#e5484d";
    ctx.shadowColor = "#e5484d";
    ctx.shadowBlur = side * 0.04;
    ctx.lineCap = "round";
    ctx.lineWidth = side * 0.035;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.moveTo(cx - arm, cy - arm);
    ctx.lineTo(cx + arm, cy + arm);
    ctx.moveTo(cx + arm, cy - arm);
    ctx.lineTo(cx - arm, cy + arm);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const fontSize = Math.round(side * 0.05);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    wrapText(ctx, this.errorMessage, canvas.width * 0.8).forEach((line, i) =>
      ctx.fillText(line, cx, cy + radius + side * 0.08 + i * fontSize * 1.3),
    );
  };

  /**
   * Renders one frame: clears the screen, lets the active animation draw in matrix units, centred
   * and scaled to the screen height. When the animation finishes, the next content starts.
   */
  private renderFrame = (): void => {
    const animation = this.runner.current;
    if (!animation) return;

    const { ctx, canvas } = this;
    const side = Math.min(canvas.width, canvas.height);
    const scale = side / MATRIX_SIZE;

    this.clearScreen("#000");
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      (canvas.width - side) / 2,
      (canvas.height - side) / 2,
    );
    animation.render({
      ctx,
      width: MATRIX_SIZE,
      height: MATRIX_SIZE,
      elapsedMs: this.runner.elapsedMs(),
    });

    if (!animation.finished) return;
    const next = this.runner.afterExit;
    this.stop();
    next?.();
  };
}
