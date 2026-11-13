/**
 * Copy of src/utils/clock.ts: playback position that pauses, resumes and seeks. Paused time does not advance.
 */
class PlaybackClock {
  private offsetMs = 0;
  private startedAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  get paused(): boolean {
    return this.startedAt === null;
  }

  start(positionMs: number): void {
    this.offsetMs = positionMs;
    this.startedAt = this.now();
  }

  seek(positionMs: number): void {
    this.offsetMs = positionMs;
    if (this.startedAt !== null) this.startedAt = this.now();
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.offsetMs = this.elapsedMs();
    this.startedAt = null;
  }

  resume(): void {
    if (this.startedAt !== null) return;
    this.startedAt = this.now();
  }

  elapsedMs(): number {
    if (this.startedAt === null) return this.offsetMs;
    return this.now() - this.startedAt + this.offsetMs;
  }
}
