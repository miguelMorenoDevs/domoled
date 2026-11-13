// 1. THE IMPORT CLOAK: 'type' MUST be outside the brackets!
// This guarantees the compiler completely erases this line from the final code.
import type {
  GpioMapping,
  MatrixOptions,
  RuntimeOptions,
} from "rpi-led-matrix";
import { createRequire } from "node:module";
import { WebSocketServer, WebSocket } from "ws";
import { createCanvas, loadImage, Canvas, Image } from "@napi-rs/canvas";
import type {
  AnimatorConfig,
  AnimatorState,
  CanvasContext,
  LedMatrixDevice,
  LedMatrixDriver,
  TrackData,
} from "./types.js";
import type { Animation } from "../animator/types.js";
import { AnimationRunner } from "../animator/runner.js";
import { CdAnimation } from "./animations/cd.js";
import { CalicoCatAnimation } from "./animations/calico.js";
import { AlbumArtLoadError } from "./errors.js";

// qrcode-terminal's encoder returns the module grid; its public API only prints text.
const requireQr = createRequire(import.meta.url);
const QRCode = requireQr("qrcode-terminal/vendor/QRCode");
const QRErrorCorrectLevel = requireQr(
  "qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel",
);

let LedMatrix: LedMatrixDriver;

// 2. Platform Check
if (process.platform === "win32" || process.platform === "darwin") {
  console.warn(
    "[CdAnimator] ⚠️ Windows/Mac detected. Using a safe local Mock Matrix.",
  );

  LedMatrix = class MockLedMatrix {
    static defaultMatrixOptions() {
      return {
        rows: 64,
        cols: 64,
        hardwareMapping: "regular",
      } as MatrixOptions;
    }
    static defaultRuntimeOptions() {
      return { gpioSlowdown: 2 } as RuntimeOptions;
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
  private matrix: LedMatrixDevice;
  private canvas: Canvas;
  private ctx: CanvasContext;
  private readonly runner = new AnimationRunner<CanvasContext>();
  private loadedTrack: { track: TrackData; art: Image } | null = null;

  private config: Required<AnimatorConfig>;
  private intervalId: NodeJS.Timeout | null = null;

  private qrModules: boolean[][] = [];

  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();

  private shown: AnimatorState | null = null;
  private listeners: Set<(state: AnimatorState) => void> = new Set();

  constructor(config?: AnimatorConfig) {
    this.config = {
      fps: 30,
      matrixDimensions: { rows: 64, cols: 64 },
      ...config,
    };

    const matrixOptions: MatrixOptions = LedMatrix.defaultMatrixOptions();
    matrixOptions.rows = this.config.matrixDimensions.rows;
    matrixOptions.cols = this.config.matrixDimensions.cols;
    matrixOptions.hardwareMapping = "regular" as GpioMapping;

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
    // Never keep the previous track's art/duration when this load fails.
    this.loadedTrack = null;

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

    this.loadedTrack = { track, art };
    console.log(
      `[CdAnimator] Track loaded. Duration: ${track.durationMs}ms, position: ${track.progressMs}ms`,
    );
  }

  /**
   * Starts or resumes the animation from the track's current playback position.
   */
  public play(): void {
    if (!this.loadedTrack) {
      console.warn("No track loaded. Call setTrack() first.");
      return;
    }
    if (this.waitForExit(() => this.play())) return;

    const { track, art } = this.loadedTrack;
    console.log(`[CdAnimator] Playing from ${track.progressMs}ms...`);
    this.run(new CdAnimation(track, art), track.progressMs, () =>
      this.startIdle(),
    );
    this.show({ kind: "track", track, positionMs: track.progressMs });
  }

  /**
   * Freezes the running track's animation on its current frame. The matrix keeps the last frame.
   */
  public pause(): void {
    if (!this.runner.pause()) return;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  /**
   * Continues a paused track's animation from where it stopped, without restarting the intro.
   */
  public resume(): void {
    if (!this.runner.resume()) return;
    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderFrame, frameDelay);
  }

  /**
   * Moves a playing or paused track's animation to `progressMs`, without restarting the intro.
   */
  public seek(progressMs: number): void {
    if (!(this.runner.current instanceof CdAnimation)) return;
    this.runner.seek(progressMs);
  }

  /**
   * Calls `listener` with the current state now and on every change. Returns the unsubscribe function.
   */
  public subscribe(listener: (state: AnimatorState) => void): () => void {
    this.listeners.add(listener);
    if (this.shown) listener(this.snapshot(this.shown));
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Starts the idle cat: it jumps in once, sleeps 10 s then stretches in a loop, and jumps out once
   * when play() or showQr() takes over. Call only for an authenticated user with nothing playing.
   */
  public startIdle(): void {
    const current = this.runner.current;
    if (current instanceof CalicoCatAnimation && !current.exiting) return;
    if (this.waitForExit(() => this.startIdle())) return;

    console.log("[CdAnimator] Idle cat animation started.");
    this.run(new CalicoCatAnimation(), 0, null);
    this.show({ kind: "idle" });
  }

  /**
   * Shows a login QR code (dark modules on white) until the stream is replaced.
   */
  public showQr(url: string): void {
    if (this.waitForExit(() => this.showQr(url))) return;

    this.stop();

    const qr = new QRCode(-1, QRErrorCorrectLevel.L);
    qr.addData(url);
    qr.make();
    this.qrModules = qr.modules;

    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderQrFrame, frameDelay);
    this.show({ kind: "qr", modules: this.qrModules });
  }

  /**
   * Stops the animation and clears the LED matrix.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.runner.clear();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.presentFrame();
  }

  /**
   * Replaces the running animation: it runs its outro, then `next` runs. Returns false when nothing
   * is running, so the caller can start right away.
   */
  private waitForExit(next: () => void): boolean {
    // A paused outro would never finish, so a replaced track resumes playback first.
    this.resume();
    return this.runner.waitForExit(next);
  }

  /**
   * Starts an animation on the shared interval. `afterExit` runs once it has finished.
   */
  private run(
    animation: Animation<CanvasContext>,
    progressOffsetMs: number,
    afterExit: (() => void) | null,
  ): void {
    this.stop(); // Prevent overlapping intervals

    this.runner.start(animation, progressOffsetMs, afterExit);
    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderFrame, frameDelay);
  }

  private show(state: AnimatorState): void {
    this.shown = state;
    for (const listener of this.listeners) listener(this.snapshot(state));
  }

  /** A track's position is live: it is read when the snapshot is taken, not when the track started. */
  private snapshot(state: AnimatorState): AnimatorState {
    return state.kind === "track"
      ? { ...state, positionMs: this.runner.elapsedMs() }
      : state;
  }

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
   * Renders one frame: clears the canvas, lets the active animation draw, then pushes it out.
   * When the animation finishes, the next content starts.
   */
  private renderFrame = (): void => {
    const animation = this.runner.current;
    if (!animation) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    animation.render({
      ctx: this.ctx,
      width: this.canvas.width,
      height: this.canvas.height,
      elapsedMs: this.runner.elapsedMs(),
    });

    this.presentFrame();

    if (!animation.finished) return;
    const next = this.runner.afterExit;
    this.stop();
    next?.();
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
