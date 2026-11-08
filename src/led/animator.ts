// 1. THE IMPORT CLOAK: 'type' MUST be outside the brackets!
// This guarantees the compiler completely erases this line from the final code.
import type {
  LedMatrixInstance,
  MatrixOptions,
  RuntimeOptions,
} from "rpi-led-matrix";
import { WebSocketServer, WebSocket } from "ws";
import { createCanvas, loadImage, Canvas, Image } from "@napi-rs/canvas";
import type { AnimatorConfig, TrackData } from "./types.js";

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
  private cdImage: Image | null = null;

  private config: Required<AnimatorConfig>;
  private intervalId: NodeJS.Timeout | null = null;

  private currentDurationMs: number = 0;
  private startTime: number = 0;
  private progressOffsetMs: number = 0;

  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();

  constructor(config?: AnimatorConfig) {
    this.config = {
      fps: 30,
      introDurationMs: 2000,
      outroDurationMs: 5000,
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
    this.cdImage = null;
    this.currentDurationMs = 0;

    console.log(`[CdAnimator] Loading album art from: ${track.imageUrl}`);
    try {
      this.cdImage = await loadImage(track.imageUrl);
    } catch (error) {
      console.error(
        `[CdAnimator] Failed to load album art from: ${track.imageUrl}`,
        error,
      );
      throw new AlbumArtLoadError(track.imageUrl, error);
    }

    this.currentDurationMs = track.durationMs;
    console.log(`[CdAnimator] Track loaded. Duration: ${track.durationMs}ms`);
  }

  /**
   * Starts or resumes the animation.
   * @param progressMs The current playback position of the song (default: 0)
   */
  public play(progressMs: number = 0): void {
    if (!this.cdImage) {
      console.warn("No track loaded. Call setTrack() first.");
      return;
    }

    this.stop(); // Prevent overlapping intervals

    this.progressOffsetMs = progressMs;
    this.startTime = Date.now();
    const frameDelay = 1000 / this.config.fps;

    console.log(`[CdAnimator] Playing from ${progressMs}ms...`);
    this.intervalId = setInterval(this.renderFrame, frameDelay);
  }

  /**
   * Stops the animation and clears the LED matrix.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.matrix.clear();
    this.matrix.sync();
  }

  /**
   * The core rendering loop - Layering textures to build a realistic 32x32 CD
   */
  private renderFrame = (): void => {
    if (!this.cdImage) return;

    const elapsed = Date.now() - this.startTime + this.progressOffsetMs;
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.clearRect(0, 0, width, height);

    // --- 1. Sizing Math ---
    // Create a 6-pixel padding so the CD isn't touching the edges
    const padding = 6;
    const cdRadius = width / 2 - padding;

    let yPos = height / 2;
    const xPos = width / 2;
    let opacity = 1.0;

    const rotation = (elapsed / 1000) * (Math.PI / 2);
    let floatOffset = 0;

    const { introDurationMs, outroDurationMs } = this.config;

    // --- 2. Timings & Position Math ---
    if (elapsed < introDurationMs) {
      const progress = elapsed / introDurationMs;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const startY = height + cdRadius * 2; // Start below the screen
      yPos = startY - (startY - height / 2) * easeOut;
    } else if (elapsed > this.currentDurationMs - outroDurationMs) {
      const timeInOutro = elapsed - (this.currentDurationMs - outroDurationMs);
      const progress = Math.min(1, timeInOutro / outroDurationMs);
      opacity = Math.max(0, 1 - progress);
      floatOffset = Math.sin(elapsed / 500) * 1.5;
    } else {
      floatOffset = Math.sin(elapsed / 500) * 1.5;
    }

    yPos += floatOffset;

    // --- 3. RENDER LAYERS ---
    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.ctx.translate(xPos, yPos); // Move origin to center

    this.ctx.save();
    this.ctx.rotate(rotation); // Rotate the CD

    // A. Outer Silver Rim
    this.ctx.beginPath();
    this.ctx.arc(0, 0, cdRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = "#b5b5ba";
    this.ctx.fill();

    // B. Clip and Draw the Album Art
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(0, 0, cdRadius - 1.5, 0, Math.PI * 2); // Leave a 1.5px silver rim
    this.ctx.clip();

    const imageScale = 0.9; // 0.75 = 75% of the CD size. Adjust to taste!
    const scaledSize = cdRadius * 2 * imageScale;
    const offset = -scaledSize / 2; // Centers the smaller image
    // -------------------------

    this.ctx.imageSmoothingEnabled = false;

    // Use the scaled variables here
    this.ctx.drawImage(this.cdImage, offset, offset, scaledSize, scaledSize);
    this.ctx.restore();

    // C. The Center Hole
    // LEDs love pure black. Instead of erasing pixels, we just paint them #000 (Off).
    const holeRadius = 4;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, holeRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = "#000000";
    this.ctx.fill();

    // D. Subtle inner plastic ring
    this.ctx.beginPath();
    this.ctx.arc(0, 0, holeRadius + 1.5, 0, Math.PI * 2);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.restore(); // <--- STOP ROTATION HERE

    // E. Static Light Sheen
    // Reduced from 0.35 to 0.15 so it doesn't wash out the album art
    const sheenGradient = this.ctx.createLinearGradient(
      -cdRadius,
      -cdRadius,
      cdRadius,
      cdRadius,
    );
    sheenGradient.addColorStop(0.0, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(0.4, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)"); // The glare
    sheenGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.0)");
    sheenGradient.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(0, 0, cdRadius, 0, Math.PI * 2);
    this.ctx.clip();
    this.ctx.fillStyle = sheenGradient;
    this.ctx.fillRect(-cdRadius, -cdRadius, cdRadius * 2, cdRadius * 2);
    this.ctx.restore();

    this.ctx.restore(); // Complete Canvas Cleanup

    // Push frame to matrix
    this.drawCanvasToMatrix();

    // Push frame to local browser simulator
    if (this.wsClients && this.wsClients.size > 0) {
      const dataUrl = this.canvas.toDataURL();
      const message = JSON.stringify({ type: "frame", dataUrl });

      for (const client of this.wsClients) {
        if (client.readyState === 1) {
          client.send(message);
        }
      }
    }

    // End Condition
    if (elapsed >= this.currentDurationMs) {
      this.stop();
      console.log("[CdAnimator] Track finished.");
    }
  };

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
