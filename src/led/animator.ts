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

const IDLE_CAT = {
  jumpMs: 1200,
  settleMs: 700,
  lickPeriodMs: 800,
  lickCount: 3,
  pauseMinMs: 5000,
  pauseMaxMs: 10000,
};

const CAT_WHITE = "#f5f1ea";
const CAT_ORANGE = "#e8892b";
const CAT_BLACK = "#1c1c1c";

type CanvasContext = ReturnType<Canvas["getContext"]>;

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function fillEllipse(
  ctx: CanvasContext,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function fillTriangle(
  ctx: CanvasContext,
  points: readonly (readonly [number, number])[],
  color: string,
): void {
  const [first, ...rest] = points;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (const [px, py] of rest) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
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

  private idleEnabled: boolean = false;
  private idleCycleStartMs: number = 0;
  private idleCycleDurationMs: number = 0;

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
    this.stop(); // Halt any current animation

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

    this.stop(); // Prevent overlapping intervals

    this.progressOffsetMs = this.trackProgressMs;
    this.startTime = Date.now();
    this.animationActive = true;
    const frameDelay = 1000 / this.config.fps;

    console.log(`[CdAnimator] Playing from ${this.progressOffsetMs}ms...`);
    this.intervalId = setInterval(this.renderFrame, frameDelay);
  }

  /**
   * Starts the idle loop: a sleeping calico cat jumps in, lies down and licks its leg.
   * Call only for an authenticated user with nothing playing.
   */
  public startIdle(): void {
    if (this.idleEnabled && this.intervalId) return;

    this.stop(); // Replaces any running CD animation

    const now = Date.now();
    this.idleEnabled = true;
    this.idleCycleStartMs = now;
    this.idleCycleDurationMs = 0;

    console.log("[CdAnimator] Idle cat animation started.");
    const frameDelay = 1000 / this.config.fps;
    this.intervalId = setInterval(this.renderIdleFrame, frameDelay);
  }

  /**
   * Shows a login QR code (dark modules on white) until the stream is replaced.
   */
  public showQr(url: string): void {
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
    this.idleEnabled = false;
    this.exitAnimation();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.presentFrame();
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
   * Renders one idle frame: the calico cat jumps in, settles, licks and sleeps.
   */
  private renderIdleFrame = (): void => {
    const now = Date.now();
    const { jumpMs, settleMs, lickPeriodMs, lickCount } = IDLE_CAT;
    const activeMs = jumpMs + settleMs + lickPeriodMs * lickCount;

    if (now - this.idleCycleStartMs >= this.idleCycleDurationMs) {
      const pauseMs =
        IDLE_CAT.pauseMinMs +
        Math.random() * (IDLE_CAT.pauseMaxMs - IDLE_CAT.pauseMinMs);
      this.idleCycleStartMs = now;
      this.idleCycleDurationMs = activeMs + pauseMs;
    }

    const t = now - this.idleCycleStartMs;
    let x = this.canvas.width / 2;
    let jump = 0;
    let lie = 1;
    let lick = 0;

    if (t < jumpMs) {
      const progress = t / jumpMs;
      x = lerp(8, this.canvas.width / 2, progress);
      jump = Math.sin(Math.PI * progress) * 16;
      lie = 0;
    } else if (t < jumpMs + settleMs) {
      const progress = (t - jumpMs) / settleMs;
      lie = 1 - Math.pow(1 - progress, 2);
    } else if (t < activeMs) {
      const lickT = t - jumpMs - settleMs;
      lick = Math.max(0, Math.sin((2 * Math.PI * lickT) / lickPeriodMs));
    }

    const breath = Math.sin(now / 600) * 0.04;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawCat({ x, jump, lie, lick, breath, sleeping: t >= activeMs });
    this.presentFrame();
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

  private drawCat(pose: {
    x: number;
    jump: number;
    lie: number;
    lick: number;
    breath: number;
    sleeping: boolean;
  }): void {
    const ctx = this.ctx;
    const { x, lie, lick, breath } = pose;
    const y = -pose.jump;
    const lerpPose = (standing: number, lying: number) =>
      lerp(standing, lying, lie);

    // Body: upright oval when standing, flat loaf when lying.
    const bodyX = lerpPose(x - 1, x);
    const bodyY = lerpPose(40, 44) + y;
    const bodyRx = lerpPose(9, 13);
    const bodyRy = lerpPose(8, 4.5) * (1 + breath);

    // Head: rests on the front paws and tilts down while licking.
    const headX = lerpPose(x + 8, x + 13) + lick * 1;
    const headY = lerpPose(31, 42) + y + lick * 2;
    const headR = 5.5;

    // Tail: curls along the floor when lying down.
    ctx.beginPath();
    ctx.moveTo(bodyX - bodyRx * 0.8, bodyY + bodyRy * 0.3);
    ctx.quadraticCurveTo(
      lerpPose(x - 16, x - 18),
      lerpPose(44, 49) + y,
      lerpPose(x - 14, x - 17),
      lerpPose(30, 42) + y,
    );
    ctx.lineWidth = 3;
    ctx.strokeStyle = CAT_ORANGE;
    ctx.lineCap = "round";
    ctx.stroke();

    // Legs: four stubs at the floor, back pair tucked, front paw forward.
    fillEllipse(
      ctx,
      bodyX - bodyRx * 0.6,
      bodyY + bodyRy * 0.8,
      2.2,
      2.2,
      CAT_WHITE,
    );
    fillEllipse(
      ctx,
      bodyX + bodyRx * 0.5,
      bodyY + bodyRy * 0.8,
      2.2,
      2.2,
      CAT_WHITE,
    );

    // Body with calico patches clipped to its outline.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bodyX, bodyY, bodyRx, bodyRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = CAT_WHITE;
    ctx.fill();
    ctx.clip();
    fillEllipse(ctx, bodyX - 4, bodyY - 1, 5, 4.5, CAT_ORANGE);
    fillEllipse(ctx, bodyX + 4, bodyY - 2, 3, 3, CAT_BLACK);
    fillEllipse(ctx, bodyX + 9, bodyY + 1, 2.5, 2, CAT_ORANGE);
    ctx.restore();

    // Ears behind the head.
    const earBack = [
      [headX - 4, headY - 3],
      [headX - 5, headY - 9],
      [headX - 1, headY - 4],
    ] as const;
    fillTriangle(ctx, earBack, CAT_ORANGE);

    // Head with calico cap and cheek patch.
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = CAT_WHITE;
    ctx.fill();
    ctx.clip();
    fillEllipse(ctx, headX - 2, headY - 3, 3.5, 2.5, CAT_ORANGE);
    fillEllipse(ctx, headX + 3, headY + 2, 2, 2, CAT_BLACK);
    ctx.restore();

    // Front ear.
    const earFront = [
      [headX + 1, headY - 4],
      [headX + 2, headY - 10],
      [headX + 5, headY - 3],
    ] as const;
    fillTriangle(ctx, earFront, CAT_BLACK);

    // Closed eyes while asleep.
    if (pose.sleeping || lie > 0.5) {
      ctx.beginPath();
      ctx.arc(headX + 2.5, headY - 0.5, 1.2, Math.PI * 0.1, Math.PI * 0.9);
      ctx.strokeStyle = CAT_BLACK;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Front leg: resting on the floor, raised to the mouth while licking.
    const pawX = lerp(headX + 1, headX + 4, lick);
    const pawY = lerp(bodyY + bodyRy * 0.8, headY + 3, lick);
    if (lick > 0.5) {
      fillEllipse(ctx, headX + 4, headY + 3.5, 1.4, 1, "#ff7fa0");
    }
    fillEllipse(ctx, pawX, pawY, 2.6, 1.8, CAT_WHITE);
  }

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
