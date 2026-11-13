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

// Ctx is the target's 2D context: node-canvas on the LED matrix, the DOM canvas on the TV.
export interface AnimationFrame<Ctx> {
  ctx: Ctx;
  width: number;
  height: number;
  elapsedMs: number;
}

export type AnimationPhase = "intro" | "loop" | "outro" | "done";

export interface AnimationPhaseState {
  phase: AnimationPhase;
  elapsedInPhaseMs: number;
}

export interface Animation<Ctx> {
  /** Starts the outro once the intro has ended; idempotent. */
  exit(elapsedMs: number): void;
  readonly exiting: boolean;
  /** True once the outro has ended; the animator then starts the next content. */
  readonly finished: boolean;
  /** Draws one frame into the canvas context. The animator clears the canvas first. */
  render(frame: AnimationFrame<Ctx>): void;
}
