import type { Canvas, Image } from "@napi-rs/canvas";

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
}

export interface CdTimingConfig {
  introDurationMs: number;
  outroDurationMs: number;
}

export interface CalicoTimingConfig {
  introJumpMs: number;
  introSettleMs: number;
  stretchPeriodMs: number;
  stretchMs: number;
  outroDurationMs: number;
}

export interface AnimationFrame {
  ctx: ReturnType<Canvas["getContext"]>;
  width: number;
  height: number;
  elapsedMs: number;
}

export interface LedAnimation {
  /** Runs once per loaded track, after its album art has loaded. */
  onLoad?(track: TrackData, art: Image): void;
  /** Runs when the track ends or playback is stopped. */
  onExit?(): void;
  /** Draws one frame into the canvas context. The animator clears the canvas first. */
  render(frame: AnimationFrame): void;
}
