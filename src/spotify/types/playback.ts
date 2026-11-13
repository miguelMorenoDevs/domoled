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
  | { kind: "load"; track: TrackData }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "seek"; progressMs: number }
  | { kind: "idle" };

export interface PlaybackTransition {
  memory: PlaybackMemory | null;
  actions: PlaybackAction[];
}
