import type { Canvas } from "@napi-rs/canvas";
import type { Color, MatrixOptions, RuntimeOptions } from "rpi-led-matrix";

// The subset of rpi-led-matrix's LedMatrix the animator uses, so the hardware and mock matrices share one shape.
export interface LedMatrixDevice {
  width(): number;
  height(): number;
  clear(): LedMatrixDevice;
  sync(): void;
  fgColor(color: Color): LedMatrixDevice;
  setPixel(x: number, y: number): LedMatrixDevice;
}

export interface LedMatrixDriver {
  defaultMatrixOptions(): MatrixOptions;
  defaultRuntimeOptions(): RuntimeOptions;
  new (
    matrixOptions: MatrixOptions,
    runtimeOptions: RuntimeOptions,
  ): LedMatrixDevice;
}

export interface MatrixDimensions {
  rows: 16 | 32 | 64;
  cols: 16 | 32 | 64;
}

export interface AnimatorConfig {
  fps?: number;
  matrixDimensions?: MatrixDimensions;
}

export interface TrackData {
  imageUrl: string;
  durationMs: number;
  progressMs: number;
  contentType: "track" | "episode";
}

export interface CdTimingConfig {
  introDurationMs: number;
  outroDurationMs: number;
}

export interface CalicoTimingConfig {
  introJumpMs: number;
  introSettleMs: number;
  sleepMs: number;
  stretchMs: number;
  outroDurationMs: number;
}

export interface AnimationFrame {
  ctx: ReturnType<Canvas["getContext"]>;
  width: number;
  height: number;
  elapsedMs: number;
}

export type CanvasContext = AnimationFrame["ctx"];

export type AnimationPhase = "intro" | "loop" | "outro" | "done";

export interface AnimationPhaseState {
  phase: AnimationPhase;
  elapsedInPhaseMs: number;
}

export interface CatPose {
  x: number;
  jump: number;
  lie: number;
  stretch: number;
  eyesClosed: boolean;
}

export type AnimatorState =
  | { kind: "track"; track: TrackData; positionMs: number }
  | { kind: "idle" }
  | { kind: "qr"; modules: boolean[][] };

export interface LedAnimation {
  /** Starts the outro once the intro has ended; idempotent. */
  exit(elapsedMs: number): void;
  readonly exiting: boolean;
  /** True once the outro has ended; the animator then starts the next content. */
  readonly finished: boolean;
  /** Draws one frame into the canvas context. The animator clears the canvas first. */
  render(frame: AnimationFrame): void;
}
