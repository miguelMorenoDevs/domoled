import type { CdAnimator } from "../led/animator.js";
import type SpotifyClient from "./client.js";
import { SpotifyApiError } from "./errors.js";
import type { GetCurrentlyPlayedSong } from "./types/api.js";
import type {
  BoundaryPoll,
  PlaybackAction,
  PlaybackMemory,
  PlaybackTransition,
  PollSchedule,
} from "./types/playback.js";

export const POLL_INTERVAL_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const DRIFT_TOLERANCE_MS = 2_000;
const BOUNDARY_SLACK_MS = 500;
const STALE_RETRY_MS = 500;
const MAX_STALE_RETRIES = 3;

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

/**
 * Picks the next poll: at the track end (plus slack) when a track is playing and ends before the
 * 2 s interval, and a short retry while Spotify still reports the previous track at that boundary.
 */
export function scheduleNextPoll(
  song: GetCurrentlyPlayedSong | undefined,
  prevTrackId: string | undefined,
  boundary: BoundaryPoll,
): PollSchedule {
  if (
    boundary.pending &&
    song &&
    song.id === prevTrackId &&
    boundary.retries < MAX_STALE_RETRIES
  )
    return {
      delayMs: STALE_RETRY_MS,
      boundary: { pending: true, retries: boundary.retries + 1 },
      stale: true,
    };

  const remainingMs = song ? song.durationMs - song.progressMs : 0;
  const delayMs =
    song?.isPlaying && remainingMs > 0
      ? Math.min(POLL_INTERVAL_MS, remainingMs + BOUNDARY_SLACK_MS)
      : POLL_INTERVAL_MS;
  return {
    delayMs,
    boundary: { pending: delayMs < POLL_INTERVAL_MS, retries: 0 },
    stale: false,
  };
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
let backoffMs = POLL_INTERVAL_MS;
let boundary: BoundaryPoll = { pending: false, retries: 0 };

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
 * Polls the active user's currently-playing every 2 s, or at the track end when it comes sooner, and
 * drives the animator. Stops by itself when no user is active; calling it again restarts polling from
 * scratch.
 */
export function startPlaybackPoller(
  spotify: PlaybackSpotify,
  animator: PlaybackAnimator,
): void {
  clearTimeout(timer);
  const current = ++run;
  memory = null;
  backoffMs = POLL_INTERVAL_MS;
  boundary = { pending: false, retries: 0 };

  const tick = async (): Promise<void> => {
    timer = undefined;
    let nextMs = backoffMs;
    try {
      if (!(await spotify.hasActiveUser())) return;
      const song = await spotify.getCurrentSong();
      if (current !== run) return;

      backoffMs = POLL_INTERVAL_MS;
      const schedule = scheduleNextPoll(song, memory?.trackId, boundary);
      boundary = schedule.boundary;
      nextMs = schedule.delayMs;
      if (!schedule.stale) {
        const transition = playbackTransition(memory, song, Date.now());
        for (const action of transition.actions) await apply(animator, action);
        memory = transition.memory;
      }
    } catch (error) {
      if (current !== run) return;
      boundary = { pending: false, retries: 0 };
      if (error instanceof SpotifyApiError && error.status === 429) {
        backoffMs = rateLimitDelayMs(backoffMs, error.retryAfterSeconds);
        nextMs = backoffMs;
        console.warn(
          `[Playback] Spotify rate limit, polling again in ${nextMs} ms`,
        );
      } else {
        console.error("[Playback] Poll failed", error);
      }
    }
    if (current === run) timer = setTimeout(tick, nextMs);
  };

  timer = setTimeout(tick, 0);
}
