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

export type CanvasContext = ReturnType<Canvas["getContext"]>;

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
