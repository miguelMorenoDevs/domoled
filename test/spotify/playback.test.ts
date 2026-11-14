import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  buildSpotifyStatus,
  playbackTransition,
  statusTrack,
  rateLimitDelayMs,
  scheduleNextPoll,
  startPlaybackPoller,
  POLL_INTERVAL_MS,
} from "../../src/spotify/playback.js";
import { SpotifyApiError } from "../../src/spotify/errors.js";
import type { GetCurrentlyPlayedSong } from "../../src/spotify/types/api.js";
import type { PlaybackMemory } from "../../src/spotify/types/playback.js";

function song(overrides: Partial<GetCurrentlyPlayedSong> = {}) {
  return {
    id: "track-1",
    title: "Song",
    artist: "Artist",
    image: "https://img.example/art.jpg",
    durationMs: 200_000,
    progressMs: 10_000,
    isPlaying: true,
    contentType: "track" as const,
    ...overrides,
  };
}

function memoryAt(now: number, overrides: Partial<PlaybackMemory> = {}) {
  return {
    trackId: "track-1",
    durationMs: 200_000,
    isPlaying: true,
    progressMs: 10_000,
    polledAt: now,
    ...overrides,
  };
}

const load = {
  kind: "load",
  track: {
    imageUrl: "https://img.example/art.jpg",
    durationMs: 200_000,
    progressMs: 10_000,
    contentType: "track",
  },
  isPlaying: true,
} as const;

test("playback: first reply loads the track", () => {
  const { actions, memory } = playbackTransition(null, song(), 0);
  assert.deepEqual(actions, [load]);
  assert.equal(memory?.trackId, "track-1");
});

test("playback: a new track id loads it again", () => {
  const { actions } = playbackTransition(
    memoryAt(0),
    song({ id: "track-2" }),
    5_000,
  );
  assert.deepEqual(actions, [load]);
});

test("playback: a track that starts paused loads it paused", () => {
  const { actions } = playbackTransition(null, song({ isPlaying: false }), 0);
  assert.deepEqual(actions, [{ ...load, isPlaying: false }]);
});

test("playback: no drift while playing on time gives no actions", () => {
  // 5 s later the track should be at 15 s; Spotify reports 15.5 s.
  const { actions } = playbackTransition(
    memoryAt(0),
    song({ progressMs: 15_500 }),
    5_000,
  );
  assert.deepEqual(actions, []);
});

test("playback: progress drift over 2 s seeks", () => {
  const { actions } = playbackTransition(
    memoryAt(0),
    song({ progressMs: 60_000 }),
    5_000,
  );
  assert.deepEqual(actions, [{ kind: "seek", progressMs: 60_000 }]);
});

test("playback: is_playing false pauses, true resumes", () => {
  const paused = playbackTransition(
    memoryAt(0),
    song({ isPlaying: false, progressMs: 15_000 }),
    5_000,
  );
  assert.deepEqual(paused.actions, [{ kind: "pause" }]);

  const resumed = playbackTransition(
    memoryAt(5_000, { isPlaying: false, progressMs: 15_000 }),
    song({ progressMs: 15_000 }),
    60_000,
  );
  assert.deepEqual(resumed.actions, [{ kind: "resume" }]);
});

test("playback: a seek while paused is applied, then nothing else", () => {
  const { actions } = playbackTransition(
    memoryAt(0, { isPlaying: false, progressMs: 15_000 }),
    song({ isPlaying: false, progressMs: 90_000 }),
    5_000,
  );
  assert.deepEqual(actions, [{ kind: "seek", progressMs: 90_000 }]);
});

test("playback: resume after a drift seeks before resuming", () => {
  const { actions } = playbackTransition(
    memoryAt(0, { isPlaying: false, progressMs: 15_000 }),
    song({ progressMs: 90_000 }),
    5_000,
  );
  assert.deepEqual(actions, [
    { kind: "seek", progressMs: 90_000 },
    { kind: "resume" },
  ]);
});

test("playback: nothing playing goes idle and forgets the track", () => {
  const { actions, memory } = playbackTransition(memoryAt(0), undefined, 5_000);
  assert.deepEqual(actions, [{ kind: "idle" }]);
  assert.equal(memory, null);
});

test("playback: the same track after nothing playing loads again", () => {
  const idle = playbackTransition(memoryAt(0), undefined, 5_000);
  const { actions } = playbackTransition(idle.memory, song(), 10_000);
  assert.deepEqual(actions, [load]);
});

test("playback: a repeated track restarts once past its end", () => {
  const { actions } = playbackTransition(
    memoryAt(0, { progressMs: 199_000 }),
    song({ progressMs: 0 }),
    5_000,
  );
  assert.deepEqual(actions, [
    {
      kind: "load",
      track: {
        imageUrl: "https://img.example/art.jpg",
        durationMs: 200_000,
        progressMs: 0,
        contentType: "track",
      },
      isPlaying: true,
    },
  ]);
});

test("schedule: a long track polls on the 2 s interval", () => {
  const next = scheduleNextPoll(song(), "track-1", {
    pending: false,
    retries: 0,
  });
  assert.deepEqual(next, {
    delayMs: POLL_INTERVAL_MS,
    boundary: { pending: false, retries: 0 },
    stale: false,
  });
});

test("schedule: a track ending in 1 s polls at about 1.5 s", () => {
  const next = scheduleNextPoll(
    song({ durationMs: 11_000, progressMs: 10_000 }),
    "track-1",
    { pending: false, retries: 0 },
  );
  assert.equal(next.delayMs, 1_500);
  assert.deepEqual(next.boundary, { pending: true, retries: 0 });
  assert.equal(next.stale, false);
});

test("schedule: a stale boundary reply retries at 500 ms, three times at most", () => {
  let boundary = { pending: true, retries: 0 };
  for (let retry = 1; retry <= 3; retry++) {
    const next = scheduleNextPoll(song(), "track-1", boundary);
    assert.deepEqual(next, {
      delayMs: 500,
      boundary: { pending: true, retries: retry },
      stale: true,
    });
    boundary = next.boundary;
  }
  const next = scheduleNextPoll(song(), "track-1", boundary);
  assert.equal(next.stale, false);
  assert.equal(next.delayMs, POLL_INTERVAL_MS);
  assert.deepEqual(next.boundary, { pending: false, retries: 0 });
});

test("schedule: a new track at the boundary is applied, not retried", () => {
  const next = scheduleNextPoll(song({ id: "track-2" }), "track-1", {
    pending: true,
    retries: 0,
  });
  assert.equal(next.stale, false);
});

test("schedule: paused or past-end tracks poll on the 2 s interval", () => {
  const paused = scheduleNextPoll(
    song({ isPlaying: false, durationMs: 13_000, progressMs: 10_000 }),
    undefined,
    { pending: false, retries: 0 },
  );
  assert.equal(paused.delayMs, POLL_INTERVAL_MS);
  const pastEnd = scheduleNextPoll(
    song({ durationMs: 13_000, progressMs: 13_200 }),
    undefined,
    { pending: false, retries: 0 },
  );
  assert.equal(pastEnd.delayMs, POLL_INTERVAL_MS);
});

test("schedule: nothing playing polls on the 2 s interval", () => {
  const next = scheduleNextPoll(undefined, "track-1", {
    pending: true,
    retries: 0,
  });
  assert.equal(next.delayMs, POLL_INTERVAL_MS);
  assert.equal(next.stale, false);
});

test("playback: 429 waits Retry-After, else doubles the delay up to 60 s", () => {
  assert.equal(rateLimitDelayMs(POLL_INTERVAL_MS, 30), 30_000);
  assert.equal(
    rateLimitDelayMs(POLL_INTERVAL_MS, undefined),
    POLL_INTERVAL_MS * 2,
  );
  assert.equal(rateLimitDelayMs(40_000, undefined), 60_000);
  assert.equal(rateLimitDelayMs(60_000, undefined), 60_000);
});

test("poller: a 429 backs off and the next successful reply resets the delay", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const replies: Array<GetCurrentlyPlayedSong | Error | undefined> = [
    new SpotifyApiError("/me/player/currently-playing", 429, 20),
    song(),
    song(),
  ];
  const polls: number[] = [];
  const spotify = {
    hasActiveUser: async () => true,
    getCurrentSong: async () => {
      polls.push(Date.now());
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const calls: string[] = [];
  const animator = {
    setTrack: async () => {
      calls.push("setTrack");
    },
    play: () => calls.push("play"),
    pause: () => calls.push("pause"),
    resume: () => calls.push("resume"),
    seek: () => calls.push("seek"),
    startIdle: () => calls.push("startIdle"),
    showError: () => calls.push("showError"),
  };

  const errorLog = t.mock.method(console, "error", () => {});
  const warnLog = t.mock.method(console, "warn", () => {});
  startPlaybackPoller(spotify, animator);

  t.mock.timers.tick(0);
  await flush();
  assert.deepEqual(polls, [0]);
  assert.deepEqual(calls, ["showError"]);

  t.mock.timers.tick(19_999);
  await flush();
  assert.equal(polls.length, 1);

  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(polls, [0, 20_000]);
  assert.deepEqual(calls, ["showError", "setTrack", "play"]);

  t.mock.timers.tick(POLL_INTERVAL_MS);
  await flush();
  assert.equal(polls.length, 3);
  assert.equal(warnLog.mock.callCount(), 1);
  assert.equal(errorLog.mock.callCount(), 0);
  t.mock.timers.reset();
});

test("status: idle when nothing plays or no user is active", () => {
  assert.equal(statusTrack(undefined), null);
  assert.equal(statusTrack(song({ isPlaying: false })), null);
  assert.deepEqual(buildSpotifyStatus(null, null), {
    activeUser: null,
    playing: false,
    track: null,
  });
  assert.deepEqual(
    buildSpotifyStatus(null, { title: "Song", artist: "Artist" }),
    { activeUser: null, playing: false, track: null },
  );
});

test("status: shows the active user and the playing track", () => {
  const track = statusTrack(song());
  assert.deepEqual(track, { title: "Song", artist: "Artist" });
  assert.deepEqual(buildSpotifyStatus("user@example.com", track), {
    activeUser: "user@example.com",
    playing: true,
    track: { title: "Song", artist: "Artist" },
  });
});

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
