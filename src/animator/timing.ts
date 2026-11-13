import type {
  AnimationPhaseState,
  CalicoTimingConfig,
  CdTimingConfig,
} from "./types.js";

export const DEFAULT_CD_TIMING: CdTimingConfig = {
  introDurationMs: 2000,
  outroDurationMs: 5000,
};

export const DEFAULT_CALICO_TIMING: CalicoTimingConfig = {
  introJumpMs: 1200,
  introSettleMs: 700,
  sleepMs: 10000,
  stretchMs: 4000,
  outroDurationMs: 1200,
};

/**
 * Maps time since the animation started to its phase: intro once, loop until exitAtMs,
 * outro once after exitAtMs, then done. exitAtMs is null while the animation stays.
 */
export function animationPhaseAt(
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
