import type {
  Animation,
  AnimationFrame,
  AnimationPhase,
  AnimationPhaseState,
} from "./types.js";
import { animationPhaseAt } from "./timing.js";

/**
 * Shared lifecycle for animations on every target: intro once, loop until exit(), outro once, then finished.
 * Subclasses draw each phase; they never track the phase themselves.
 * A track (`trackMs` set) holds its last frame at its end until exit(), so the poller decides what follows.
 */
export abstract class BaseAnimation<Ctx> implements Animation<Ctx> {
  private readonly introMs: number;
  private readonly outroMs: number;
  private readonly trackMs: number | null;
  private exitAtMs: number | null = null;
  private phase: AnimationPhase = "intro";

  constructor(introMs: number, outroMs: number, trackMs: number | null = null) {
    this.introMs = introMs;
    this.outroMs = outroMs;
    this.trackMs = trackMs;
  }

  get exiting(): boolean {
    return this.exitAtMs !== null;
  }

  get finished(): boolean {
    return this.phase === "done";
  }

  /** Starts the outro after the current loop; during the intro it waits for the intro to finish. */
  exit(elapsedMs: number): void {
    if (this.exitAtMs !== null) return;
    this.exitAtMs = Math.max(this.introMs, elapsedMs);
  }

  /** True when a track has reached its end and waits for exit(). */
  holdsAt(elapsedMs: number): boolean {
    return (
      this.trackMs !== null &&
      this.exitAtMs === null &&
      elapsedMs >= this.trackMs
    );
  }

  render(frame: AnimationFrame<Ctx>): void {
    const state = animationPhaseAt(
      frame.elapsedMs,
      this.exitAtMs,
      this.introMs,
      this.outroMs,
    );
    this.phase = state.phase;
    if (state.phase === "done") return;
    this.draw(frame, state);
  }

  protected abstract draw(
    frame: AnimationFrame<Ctx>,
    state: AnimationPhaseState,
  ): void;
}
