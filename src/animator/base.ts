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
 */
export abstract class BaseAnimation<Ctx> implements Animation<Ctx> {
  private readonly introMs: number;
  private readonly outroMs: number;
  private exitAtMs: number | null = null;
  private phase: AnimationPhase = "intro";

  constructor(introMs: number, outroMs: number) {
    this.introMs = introMs;
    this.outroMs = outroMs;
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
    const scheduledMs = this.scheduledExitMs() ?? Infinity;
    this.exitAtMs = Math.max(this.introMs, Math.min(elapsedMs, scheduledMs));
  }

  render(frame: AnimationFrame<Ctx>): void {
    const exitAtMs = this.exitAtMs ?? this.scheduledExitMs();
    const state = animationPhaseAt(
      frame.elapsedMs,
      exitAtMs,
      this.introMs,
      this.outroMs,
    );
    this.phase = state.phase;
    if (state.phase === "done") return;
    this.draw(frame, state);
  }

  /** When the outro starts without an exit() call, e.g. at the end of a track. */
  protected scheduledExitMs(): number | null {
    return null;
  }

  protected abstract draw(
    frame: AnimationFrame<Ctx>,
    state: AnimationPhaseState,
  ): void;
}
