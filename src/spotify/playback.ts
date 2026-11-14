import type { CdAnimator } from "../led/animator.js";
import type SpotifyClient from "./client.js";
import { SpotifyApiError } from "./errors.js";
import type { GetCurrentlyPlayedSong } from "./types/api.js";
import type {
  PlaybackAction,
  PlaybackMemory,
  PlaybackTransition,
} from "./types/playback.js";

export const POLL_INTERVAL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const DRIFT_TOLERANCE_MS = 2_000;

type PlaybackSpotify = Pick<
  typeof SpotifyClient,
  "hasActiveUser" | "getCurrentSong"
>;
type PlaybackAnimator = Pick<
  CdAnimator,
  "setTrack" | "play" | "pause" | "resume" | "seek" | "startIdle"
>;

/** Maps one reply onto the animator actions it needs, given the previous reply. */
export function playbackTransition(
  prev: PlaybackMemory | null,
  song: GetCurrentlyPlayedSong | undefined,
  now: number,
): PlaybackTransition {
  if (!song) return { memory: null, actions: [{ kind: "idle" }] };

  const memory: PlaybackMemory = {
    trackId: song.id,
    durationMs: song.durationMs,
    isPlaying: song.isPlaying,
    progressMs: song.progressMs,
    polledAt: now,
  };
  const expectedMs = prev
    ? prev.progressMs + (prev.isPlaying ? now - prev.polledAt : 0)
    : 0;

  // A track that has run past its end restarts from the top when Spotify repeats it.
  if (!prev || prev.trackId !== song.id || expectedMs >= prev.durationMs) {
    const track = {
      imageUrl: song.image,
      durationMs: song.durationMs,
      progressMs: song.progressMs,
      contentType: song.contentType,
    };
    return {
      memory,
      actions: [{ kind: "load", track, isPlaying: song.isPlaying }],
    };
  }

  const actions: PlaybackAction[] = [];
  if (Math.abs(song.progressMs - expectedMs) > DRIFT_TOLERANCE_MS)
    actions.push({ kind: "seek", progressMs: song.progressMs });
  if (prev.isPlaying !== song.isPlaying)
    actions.push({ kind: song.isPlaying ? "resume" : "pause" });
  return { memory, actions };
}

/** Delay before the next poll after a 429: Retry-After when sent, else double, capped at 60 s. */
export function rateLimitDelayMs(
  currentMs: number,
  retryAfterSeconds: number | undefined,
): number {
  if (retryAfterSeconds !== undefined) return retryAfterSeconds * 1000;
  return Math.min(currentMs * 2, MAX_BACKOFF_MS);
}

let timer: NodeJS.Timeout | undefined;
let run = 0;
let memory: PlaybackMemory | null = null;
let delayMs = POLL_INTERVAL_MS;

async function apply(
  animator: PlaybackAnimator,
  action: PlaybackAction,
): Promise<void> {
  switch (action.kind) {
    case "load":
      await animator.setTrack(action.track);
      animator.play(!action.isPlaying);
      return;
    case "idle":
      animator.startIdle();
      return;
    case "pause":
      animator.pause();
      return;
    case "resume":
      animator.resume();
      return;
    case "seek":
      animator.seek(action.progressMs);
      return;
  }
}

/**
 * Polls the active user's currently-playing every 5 s and drives the animator. Stops by itself when
 * no user is active; calling it again restarts polling from scratch.
 */
export function startPlaybackPoller(
  spotify: PlaybackSpotify,
  animator: PlaybackAnimator,
): void {
  clearTimeout(timer);
  const current = ++run;
  memory = null;
  delayMs = POLL_INTERVAL_MS;

  const tick = async (): Promise<void> => {
    timer = undefined;
    try {
      if (!(await spotify.hasActiveUser())) return;
      const song = await spotify.getCurrentSong();
      if (current !== run) return;

      delayMs = POLL_INTERVAL_MS;
      const transition = playbackTransition(memory, song, Date.now());
      for (const action of transition.actions) await apply(animator, action);
      memory = transition.memory;
    } catch (error) {
      if (current !== run) return;
      if (error instanceof SpotifyApiError && error.status === 429) {
        delayMs = rateLimitDelayMs(delayMs, error.retryAfterSeconds);
        console.warn(
          `[Playback] Spotify rate limit, polling again in ${delayMs} ms`,
        );
      } else {
        console.error("[Playback] Poll failed", error);
      }
    }
    if (current === run) timer = setTimeout(tick, delayMs);
  };

  timer = setTimeout(tick, 0);
}
