// Animations draw in the LED matrix's 64x64 units; the screen scales them up to fill its height.
const MATRIX_SIZE = 64;
const FPS = 30;

/**
 * Same state machine as CdAnimator in src/led/animator.ts, drawing to a screen-sized canvas.
 */
class TvAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasContext;
  private animation: LedAnimation | null = null;
  private afterExit: (() => void) | null = null;
  private qrModules: boolean[][] = [];
  private intervalId: number | null = null;

  private clock = new PlaybackClock();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext("2d")!;
  }

  play(art: HTMLImageElement, track: TrackData, positionMs: number): void {
    if (this.waitForExit(() => this.play(art, track, positionMs))) return;
    this.run(new CdAnimation(track, art), positionMs, () => this.startIdle());
  }

  startIdle(): void {
    if (this.animation instanceof CalicoCatAnimation && !this.animation.exiting)
      return;
    if (this.waitForExit(() => this.startIdle())) return;
    this.run(new CalicoCatAnimation(), 0, null);
  }

  showQr(modules: boolean[][]): void {
    if (this.waitForExit(() => this.showQr(modules))) return;
    this.stop();
    this.qrModules = modules;
    this.intervalId = window.setInterval(this.renderQrFrame, 1000 / FPS);
  }

  /**
   * Freezes the running track's animation on its current frame. The screen keeps the last frame.
   */
  pause(): void {
    if (!this.animation || this.clock.paused) return;
    this.clock.pause();
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  /**
   * Continues a paused track's animation from where it stopped, without restarting the intro.
   */
  resume(): void {
    if (!this.animation || !this.clock.paused) return;
    this.clock.resume();
    this.intervalId = window.setInterval(this.renderFrame, 1000 / FPS);
  }

  /**
   * Moves a playing or paused track's animation to `progressMs`, without restarting the intro.
   */
  seek(progressMs: number): void {
    if (!(this.animation instanceof CdAnimation)) return;
    this.clock.seek(progressMs);
  }

  private stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.animation = null;
    this.afterExit = null;
    this.clearScreen("#000");
  }

  private waitForExit(next: () => void): boolean {
    if (!this.animation) return false;
    this.afterExit = next;
    // A paused outro would never finish, so a replaced track resumes playback first.
    this.resume();
    this.animation.exit(this.elapsedMs());
    return true;
  }

  private run(
    animation: LedAnimation,
    progressOffsetMs: number,
    afterExit: (() => void) | null,
  ): void {
    this.stop();

    this.animation = animation;
    this.afterExit = afterExit;
    this.clock.start(progressOffsetMs);
    this.intervalId = window.setInterval(this.renderFrame, 1000 / FPS);
  }

  private elapsedMs(): number {
    return this.clock.elapsedMs();
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
   * Renders one frame: clears the screen, lets the active animation draw in matrix units, centred
   * and scaled to the screen height. When the animation finishes, the next content starts.
   */
  private renderFrame = (): void => {
    const animation = this.animation;
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
      elapsedMs: this.elapsedMs(),
    });

    if (!animation.finished) return;
    const next = this.afterExit;
    this.stop();
    next?.();
  };
}
