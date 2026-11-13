/**
 * Maps time since the animation started to its phase: intro once, loop until exitAtMs,
 * outro once after exitAtMs, then done. exitAtMs is null while the animation stays.
 */
function animationPhaseAt(
  elapsedMs: number,
  exitAtMs: number | null,
  introMs: number,
  outroMs: number,
): AnimationPhaseState {
  if (exitAtMs !== null && elapsedMs >= exitAtMs) {
    const outroElapsedMs = elapsedMs - exitAtMs;
    if (outroElapsedMs < outroMs) {
      return { phase: "outro", elapsedInPhaseMs: outroElapsedMs };
    }
    return { phase: "done", elapsedInPhaseMs: 0 };
  }
  if (elapsedMs < introMs)
    return { phase: "intro", elapsedInPhaseMs: elapsedMs };
  return { phase: "loop", elapsedInPhaseMs: elapsedMs - introMs };
}

/**
 * Shared lifecycle for LED animations: intro once, loop until exit(), outro once, then finished.
 * Subclasses draw each phase; they never track the phase themselves.
 */
abstract class BaseLedAnimation implements LedAnimation {
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

  render(frame: AnimationFrame): void {
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
    frame: AnimationFrame,
    state: AnimationPhaseState,
  ): void;
}
