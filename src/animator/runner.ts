import { PlaybackClock } from "../utils/clock.js";
import type { Animation } from "./types.js";

/**
 * Tracks the running animation, its playback clock and the callback to run once it finishes.
 * Each animator owns its frame timer and drawing; this holds the state machine they share.
 */
export class AnimationRunner<Ctx> {
  private animation: Animation<Ctx> | null = null;
  private pendingAfterExit: (() => void) | null = null;
  private readonly clock = new PlaybackClock();

  get current(): Animation<Ctx> | null {
    return this.animation;
  }

  get afterExit(): (() => void) | null {
    return this.pendingAfterExit;
  }

  elapsedMs(): number {
    return this.clock.elapsedMs();
  }

  /** Starts `animation` at `progressOffsetMs` into its timeline; `afterExit` runs once it has finished. */
  start(
    animation: Animation<Ctx>,
    progressOffsetMs: number,
    afterExit: (() => void) | null,
  ): void {
    this.animation = animation;
    this.pendingAfterExit = afterExit;
    this.clock.start(progressOffsetMs);
  }

  clear(): void {
    this.animation = null;
    this.pendingAfterExit = null;
  }

  /** Freezes the running animation's clock. Returns false when nothing runs or it is already paused. */
  pause(): boolean {
    if (!this.animation || this.clock.paused) return false;
    this.clock.pause();
    return true;
  }

  /** Continues a paused animation from where it stopped. Returns false when nothing is paused. */
  resume(): boolean {
    if (!this.animation || !this.clock.paused) return false;
    this.clock.resume();
    return true;
  }

  /** Moves the playback position without restarting the intro. */
  seek(positionMs: number): void {
    this.clock.seek(positionMs);
  }

  /**
   * Replaces the running animation: it runs its outro, then `next` runs. Returns false when nothing
   * is running, so the caller can start right away.
   */
  waitForExit(next: () => void): boolean {
    if (!this.animation) return false;
    this.pendingAfterExit = next;
    this.animation.exit(this.elapsedMs());
    return true;
  }
}
