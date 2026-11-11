// 1. THE IMPORT CLOAK: 'type' MUST be outside the brackets!
// This guarantees the compiler completely erases this line from the final code.
import type {
  LedMatrixInstance,
  MatrixOptions,
  RuntimeOptions,
} from "rpi-led-matrix";
import { createRequire } from "node:module";
import { WebSocketServer, WebSocket } from "ws";
import { createCanvas, loadImage, Canvas, Image } from "@napi-rs/canvas";
import type { AnimatorConfig, LedAnimation, TrackData } from "./types.js";
import { CdAnimation } from "./animations/cd.js";
import { CalicoCatAnimation } from "./animations/calico.js";

// qrcode-terminal's encoder returns the module grid; its public API only prints text.
const requireQr = createRequire(import.meta.url);
const QRCode = requireQr("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = requireQr(
  "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel",
);

/** Raised when the album art URL cannot be fetched or decoded. */
export class AlbumArtLoadError extends Error {
  readonly imageUrl: string;

  constructor(imageUrl: string, cause: unknown) {
    super(`Failed to load album art from ${imageUrl}`, { cause });
    this.name = "AlbumArtLoadError";
    this.imageUrl = imageUrl;
  }
}

let LedMatrix: any;

// 2. Platform Check
if (process.platform === "win32" || process.platform === "darwin") {
  console.warn(
    "[CdAnimator] ⚠️ Windows/Mac detected. Using a safe local Mock Matrix.",
  );

  LedMatrix = class MockLedMatrix {
    static defaultMatrixOptions() {
      return { rows: 64, cols: 64, hardwareMapping: "regular" };
    }
    static defaultRuntimeOptions() {
      return { gpioSlowdown: 2 };
    }
    width() {
      return 64;
    }
    height() {
      return 64;
    }
    clear() {
      return this;
    }
    sync() {
      return this;
    }
    fgColor() {
      return this;
    }
    setPixel() {
      return this;
    }
  };
} else {
  // 3. THE REQUIRE CLOAK: 'eval' makes this 100% invisible to bundlers.
  // Esbuild/TSX won't try to package it, but Node will execute it on the Pi.
  LedMatrix = eval("require")("rpi-led-matrix").LedMatrix;
}

export class CdAnimator {
  private matrix: LedMatrixInstance;
  private canvas: Canvas;
  private ctx: ReturnType<Canvas["getContext"]>;
  private animation: LedAnimation = new CdAnimation();
  private trackLoaded: boolean = false;
  private animationActive: boolean = false;

  private config: Required<AnimatorConfig>;
  private intervalId: NodeJS.Timeout | null = null;

  private currentDurationMs: number = 0;
  private trackProgressMs: number = 0;
  private startTime: number = 0;
  private progressOffsetMs: number = 0;

  private idleAnimation: CalicoCatAnimation | null = null;
  private idleStartMs: number = 0;
  private afterIdle: (() => void) | null = null;

  private qrModules: boolean[][] = [];

  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();

  constructor(config?: AnimatorConfig) {
    this.config = {
      fps: 30,
      matrixDimensions: { rows: 64, cols: 64 },
      ...config,
    };

    const matrixOptions: MatrixOptions = LedMatrix.defaultMatrixOptions();
    matrixOptions.rows = this.config.matrixDimensions.rows;
    matrixOptions.cols = this.config.matrixDimensions.cols;
    matrixOptions.hardwareMapping = "regular" as any;

    const runtimeOptions: RuntimeOptions = LedMatrix.defaultRuntimeOptions();
    runtimeOptions.gpioSlowdown = 2;

    this.matrix = new LedMatrix(matrixOptions, runtimeOptions);

    const width = this.matrix.width();
    const height = this.matrix.height();
    this.canvas = createCanvas(width, height);

    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Failed to get 2D context");
    this.ctx = context;

    console.log(`[CdAnimator] Matrix initialized at ${width}x${height}.`);

    if (process.platform === "win32" || process.platform === "darwin") {
      this.wss = new WebSocketServer({ port: 8080 });
      this.wss.on("connection", (ws) => {
        console.log("[Simulator] 🟢 Browser connected to live stream!");
        this.wsClients.add(ws);
        ws.on("close", () => {
          this.wsClients.delete(ws);
          console.log("[Simulator] 🔴 Browser disconnected.");
        });
      });
      console.log("[Simulator] 📡 Live server running on ws://localhost:8080");
    }
  }

  /**
   * Loads a new song's data and album art.
   * Node Canvas `loadImage` natively supports http/https URLs!
   */
  public async setTrack(track: TrackData): Promise<void> {
    if (!this.idleAnimation) this.stop(); // Halt any current animation

    // Never keep the previous track's art/duration when this load fails.
    this.trackLoaded = false;
    this.currentDurationMs = 0;
    this.trackProgressMs = 0;

    console.log(`[CdAnimator] Loading album art from: ${track.imageUrl}`);
    let art: Image;
    try {
      art = await loadImage(track.imageUrl);
    } catch (error) {
      console.error(
        `[CdAnimator] Failed to load album art from: ${track.imageUrl}`,
        error,
      );
      throw new AlbumArtLoadError(track.imageUrl, error);
    }

    this.currentDurationMs = track.durationMs;
    this.trackProgressMs = track.progressMs;
    this.trackLoaded = true;
    this.animation.onLoad?.(track, art);
    console.log(
      `[CdAnimator] Track loaded. Duration: ${track.durationMs}ms, position: ${track.progressMs}ms`,
    );
  }

  /**
   * Starts or resumes the animation from the track's current playback position.
   */
  public play(): void {
    if (!this.trackLoaded) {
      console.warn("No track loaded. Call setTrack() first.");
      return;
    }
    if (this.waitForIdleExit(() => this.play())) return;

    this.stop(); // Prevent overlapping intervals

    this.progressOffsetMs = this.trackProgressMs;
    this.startTime = Date.now();
    this.animationActive = true;
    const frameDelay = 1000 / this.config.fps;

    console.log(`[CdAnimator] Playing from ${this.progressOffsetMs}ms...`);
    this.intervalId = setInterval(this.renderFrame, frameDelay);
  }

  /**
   * Starts the idle cat: it jumps in once, sleeps 10 s then stretches in a loop, and jumps out once
   * when play() or showQr() takes over. Call only for an authenticated user with nothing playing.
   */
  public startIdle(): void {
    if (this.idleAnimation && !this.idleAnimation.exiting) return;
    if (this.waitForIdleExit(() => this.startIdle())) return;

    this.stop(); // Replaces any running CD animation

    this.idleAnimation = new CalicoCatAnimation();
    this.idleStartMs = Date.now();

    console.log("[CdAnimator] Idle cat animation started.");
    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderIdleFrame, frameDelay);
  }

  /**
   * Shows a login QR code (dark modules on white) until the stream is replaced.
   */
  public showQr(url: string): void {
    if (this.waitForIdleExit(() => this.showQr(url))) return;

    this.stop();

    const qr = new QRCode(-1, QRErrorCorrectLevel.L);
    qr.addData(url);
    qr.make();
    this.qrModules = qr.modules;

    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderQrFrame, frameDelay);
  }

  /**
   * Stops the animation and clears the LED matrix.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.exitAnimation();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.presentFrame();
  }

  /**
   * Asks the idle cat to jump out. Returns true when the caller must wait: `next` runs once the outro ends.
   */
  private waitForIdleExit(next: () => void): boolean {
    if (!this.idleAnimation) return false;
    this.afterIdle = next;
    this.idleAnimation.exit(Date.now() - this.idleStartMs);
    return true;
  }

  /**
   * Runs the active animation's onExit once per playback, whether the track ended or was stopped.
   */
  private exitAnimation(): void {
    if (!this.animationActive) return;
    this.animationActive = false;
    this.animation.onExit?.();
  }

  /**
   * Renders one idle frame by drawing the calico cat animation.
   */
  private renderIdleFrame = (): void => {
    if (!this.idleAnimation) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.idleAnimation.render({
      ctx: this.ctx,
      width: this.canvas.width,
      height: this.canvas.height,
      elapsedMs: Date.now() - this.idleStartMs,
    });
    this.presentFrame();

    if (!this.idleAnimation.finished) return;
    this.idleAnimation = null;
    this.stop();
    const next = this.afterIdle;
    this.afterIdle = null;
    next?.();
  };

  /**
   * Renders the login QR: white background, black modules, one quiet-zone module around the code.
   */
  private renderQrFrame = (): void => {
    const size = this.qrModules.length;
    const cell = Math.floor(this.canvas.width / (size + 2));
    const offset = Math.floor((this.canvas.width - size * cell) / 2);

    this.ctx.fillStyle = "#fff";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#000";
    this.qrModules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) {
          this.ctx.fillRect(offset + x * cell, offset + y * cell, cell, cell);
        }
      }),
    );
    this.presentFrame();
  };

  /**
   * Renders one CD frame: clears the canvas, lets the active animation draw, then pushes it out.
   */
  private renderFrame = (): void => {
    if (!this.trackLoaded) return;

    const elapsed = Date.now() - this.startTime + this.progressOffsetMs;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.animation.render({
      ctx: this.ctx,
      width: this.canvas.width,
      height: this.canvas.height,
      elapsedMs: elapsed,
    });

    this.presentFrame();

    // End Condition
    if (elapsed >= this.currentDurationMs) {
      console.log("[CdAnimator] Track finished.");
      this.exitAnimation();
      this.startIdle();
    }
  };

  /**
   * Pushes the current canvas to the matrix and the local browser simulator.
   */
  private presentFrame(): void {
    this.drawCanvasToMatrix();

    if (this.wsClients && this.wsClients.size > 0) {
      const dataUrl = this.canvas.toDataURL();
      const message = JSON.stringify({ type: "frame", dataUrl });

      for (const client of this.wsClients) {
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    }
  }

  /**
   * Hardware push logic with Alpha blending.
   */
  private drawCanvasToMatrix(): void {
    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    const data = imageData.data;

    for (let y = 0; y < this.canvas.height; y++) {
      for (let x = 0; x < this.canvas.width; x++) {
        const i = (y * this.canvas.width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const a = data[i + 3]!;

        if (a > 0) {
          const alpha = a / 255;
          this.matrix
            .fgColor({
              r: Math.round(r * alpha),
              g: Math.round(g * alpha),
              b: Math.round(b * alpha),
            })
            .setPixel(x, y);
        } else {
          this.matrix.fgColor({ r: 0, g: 0, b: 0 }).setPixel(x, y);
        }
      }
    }
    this.matrix.sync();
  }
}

// One instance for the whole process: the matrix and simulator socket bind only once.
export const cdAnimator = new CdAnimator();
