import type { AnimationPhaseState } from "../animator/types.js";

export interface CdCurve {
  opacity: number;
  /** 0 = centred on screen, 1 = fully below it. */
  offscreen: number;
}

/**
 * CD intro and outro. The intro fades in and slides up, reaching full opacity at its midpoint.
 * The outro is the intro played in reverse over outroMs: full opacity until its midpoint, then
 * it fades out while sliding down.
 */
export function cdCurveAt(
  state: AnimationPhaseState,
  introMs: number,
  outroMs: number,
): CdCurve {
  if (state.phase === "intro") {
    const progress = state.elapsedInPhaseMs / introMs;
    return {
      opacity: Math.min(1, progress * 2),
      offscreen: 1 - easeOutCubic(progress),
    };
  }
  if (state.phase === "outro") {
    const reversed = 1 - state.elapsedInPhaseMs / outroMs;
    return {
      opacity: Math.min(1, reversed * 2),
      offscreen: 1 - easeOutCubic(reversed),
    };
  }
  return { opacity: 1, offscreen: 0 };
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}
