import type { TrackData } from "../../led/types.js";

/** What the poller saw on its last successful reply, used to compare the next one. */
export interface PlaybackMemory {
  trackId: string;
  durationMs: number;
  isPlaying: boolean;
  progressMs: number;
  polledAt: number;
}

export type PlaybackAction =
  | { kind: "load"; track: TrackData; isPlaying: boolean }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "seek"; progressMs: number }
  | { kind: "idle" };

export interface PlaybackTransition {
  memory: PlaybackMemory | null;
  actions: PlaybackAction[];
}

/** Whether the pending poll was scheduled for a track end, and how many stale retries it has used. */
export interface BoundaryPoll {
  pending: boolean;
  retries: number;
}

export interface PollSchedule {
  delayMs: number;
  boundary: BoundaryPoll;
  /** The reply still shows the previous track: its actions must not be applied. */
  stale: boolean;
}
