import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

const storeDir = mkdtempSync(path.join(os.tmpdir(), "domoled-test-"));
process.chdir(storeDir);

const {
  default: spotify,
  SpotifyApiError,
  SpotifyAuthRevokedError,
  SpotifyRequestError,
  SpotifyResponseError,
  UserNotLoggedError,
} = await import("../../src/spotify/client.js");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockSpotify(t: TestContext, routes: Record<string, () => Response>) {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    for (const [suffix, handler] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return handler();
    }
    throw new Error("Unexpected fetch: " + url);
  });
}

function loginRoutes(
  email = "user@example.com",
): Record<string, () => Response> {
  return {
    "/token": () =>
      jsonResponse({ access_token: "access", refresh_token: "refresh" }),
    "/me": () => jsonResponse({ email }),
  };
}

async function login(t: TestContext) {
  mockSpotify(t, loginRoutes());
  await spotify.getUserToken({
    grant_type: "authorization_code",
    token: "code",
  });
}

function track(overrides: Record<string, unknown> = {}) {
  return {
    device: {},
    repeat_state: "off",
    shuffle_state: false,
    context: null,
    timestamp: 0,
    progress_ms: 42000,
    is_playing: true,
    item: {
      type: "track",
      id: "track-id",
      name: "Song",
      duration_ms: 200000,
      album: {
        images: [
          { url: "https://img/640", height: 640, width: 640 },
          { url: "https://img/wide", height: 300, width: 640 },
          { url: "https://img/300", height: 300, width: 300 },
        ],
      },
    },
    currently_playing_type: "track",
    actions: {},
    ...overrides,
  };
}

test("getCurrentSong throws when no user is active", async () => {
  await spotify.clearActiveUser();

  await assert.rejects(spotify.getCurrentSong(), /There is no active user/);
});

test("setActiveUser rejects with UserNotLoggedError for an unknown email", async () => {
  await assert.rejects(
    spotify.setActiveUser("nobody@example.com"),
    (error: unknown) =>
      error instanceof UserNotLoggedError &&
      error.message === "User is not logged in" &&
      error.email === "nobody@example.com",
  );
});

test("login stores the user under their email and makes it active", async (t) => {
  await login(t);

  assert.ok((await spotify.getLoggedUsers()).includes("user@example.com"));
  assert.equal(await spotify.hasActiveUser(), true);
});

test("a login whose /me lookup fails keeps the previous active user and store", async (t) => {
  mockSpotify(t, loginRoutes("previous@example.com"));
  await spotify.getUserToken({
    grant_type: "authorization_code",
    token: "previous-code",
  });

  const storePath = path.join(storeDir, "data", "users.json");
  const storeBefore = readFileSync(storePath, "utf8");
  const usersBefore = await spotify.getLoggedUsers();

  mockSpotify(t, {
    "/token": () =>
      jsonResponse({ access_token: "failed-access", refresh_token: "failed" }),
    "/me": () => new Response(null, { status: 500 }),
  });
  await assert.rejects(
    spotify.getUserToken({ grant_type: "authorization_code", token: "bad" }),
    /Fetching user email failed/,
  );

  assert.deepEqual(await spotify.getLoggedUsers(), usersBefore);
  assert.equal(await spotify.hasActiveUser(), true);
  assert.equal(readFileSync(storePath, "utf8"), storeBefore);
  assert.equal(storeBefore.includes('"temp"'), false);

  let playingAuth: string | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/me/player/currently-playing")) {
        playingAuth = (init?.headers as Record<string, string>)[
          "Authorization"
        ];
        return jsonResponse(track());
      }
      throw new Error("Unexpected fetch: " + String(input));
    },
  );
  await spotify.getCurrentSong();
  assert.equal(playingAuth, "Bearer access");
});

test("getCurrentSong returns the largest square album image", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => jsonResponse(track()),
  });

  assert.deepEqual(await spotify.getCurrentSong(), {
    id: "track-id",
    title: "Song",
    image: "https://img/640",
    durationMs: 200000,
    progressMs: 42000,
    isPlaying: true,
    contentType: "track",
  });
});

test("getCurrentSong returns the largest image when no album image is square", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: {
            ...(track().item as object),
            album: {
              images: [
                { url: "https://img/small-wide", height: 100, width: 200 },
                { url: "https://img/big-wide", height: 300, width: 640 },
                { url: "https://img/tall", height: 500, width: 250 },
              ],
            },
          },
        }),
      ),
  });

  const song = await spotify.getCurrentSong();

  assert.equal(song?.image, "https://img/big-wide");
});

test("getCurrentSong returns undefined when the album has no images", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: {
            ...(track().item as object),
            album: { images: [] },
          },
        }),
      ),
  });

  assert.equal(await spotify.getCurrentSong(), undefined);
});

test("getCurrentSong defaults progressMs to 0 when Spotify returns null", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(track({ progress_ms: null })),
  });

  const song = await spotify.getCurrentSong();

  assert.equal(song?.progressMs, 0);
});

test("getCurrentSong returns the episode cover, duration and progress", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: {
            type: "episode",
            id: "episode-id",
            uri: "spotify:episode:episode-id",
            name: "Episode",
            duration_ms: 3600000,
            images: [
              { url: "https://img/wide", height: 300, width: 640 },
              { url: "https://img/episode", height: 640, width: 640 },
            ],
          },
          currently_playing_type: "episode",
        }),
      ),
  });

  assert.deepEqual(await spotify.getCurrentSong(), {
    id: "episode-id",
    title: "Episode",
    image: "https://img/episode",
    durationMs: 3600000,
    progressMs: 42000,
    isPlaying: true,
    contentType: "episode",
  });
});

test("getCurrentSong returns undefined for episodes without images", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: {
            type: "episode",
            name: "Episode",
            duration_ms: 1,
            images: [],
          },
          currently_playing_type: "episode",
        }),
      ),
  });

  assert.equal(await spotify.getCurrentSong(), undefined);
});

test("a currently-playing episode without images array throws a SpotifyResponseError", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: { type: "episode", name: "Episode", duration_ms: 1 },
          currently_playing_type: "episode",
        }),
      ),
  });

  await assert.rejects(spotify.getCurrentSong(), SpotifyResponseError);
});

test("getCurrentSong returns undefined when nothing is playing", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => new Response(null, { status: 204 }),
  });

  assert.equal(await spotify.getCurrentSong(), undefined);
});

test("getCurrentSong refreshes the token once on 401 and retries", async (t) => {
  await login(t);

  let playingCalls = 0;
  let refreshCalls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        refreshCalls++;
        assert.equal(
          String(init?.body).includes("grant_type=refresh_token"),
          true,
        );
        return jsonResponse({ access_token: "new-access" });
      }
      if (url.endsWith("/me/player/currently-playing")) {
        playingCalls++;
        if (playingCalls === 1) return new Response(null, { status: 401 });
        assert.equal(
          (init?.headers as Record<string, string>)["Authorization"],
          "Bearer new-access",
        );
        return jsonResponse(track());
      }
      throw new Error("Unexpected fetch: " + url);
    },
  );

  const song = await spotify.getCurrentSong();

  assert.equal(song?.title, "Song");
  assert.equal(refreshCalls, 1);
  assert.equal(playingCalls, 2);
});

test("logged users, active user and refresh token survive a restart", async (t) => {
  await login(t);

  const stored = JSON.parse(
    readFileSync(path.join(storeDir, "data", "users.json"), "utf8"),
  );
  assert.deepEqual(stored.users["user@example.com"], {
    access_token: "access",
    refresh_token: "refresh",
  });
  assert.equal(stored.active_user, "user@example.com");

  const restartedModule = "../../src/spotify/client.js?restart=1";
  const { default: restarted } = await import(restartedModule);
  assert.ok((await restarted.getLoggedUsers()).includes("user@example.com"));
  assert.equal(await restarted.hasActiveUser(), true);

  let playingCalls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        assert.equal(
          String(init?.body).includes("refresh_token=refresh"),
          true,
        );
        return jsonResponse({ access_token: "new-access" });
      }
      if (url.endsWith("/me/player/currently-playing")) {
        playingCalls++;
        if (playingCalls === 1) return new Response(null, { status: 401 });
        return jsonResponse(track());
      }
      throw new Error("Unexpected fetch: " + url);
    },
  );

  assert.equal((await restarted.getCurrentSong())?.title, "Song");
  assert.equal(playingCalls, 2);
});

test("a token store with the wrong shape is ignored on load", async () => {
  mkdirSync(path.join(storeDir, "data"), { recursive: true });
  writeFileSync(
    path.join(storeDir, "data", "users.json"),
    JSON.stringify({
      users: {
        "good@example.com": { access_token: "a", refresh_token: "r" },
        "bad@example.com": { access_token: 1 },
      },
      active_user: "good@example.com",
    }),
  );

  const restartedModule = "../../src/spotify/client.js?restart=bad-shape";
  const { default: restarted } = await import(restartedModule);

  assert.deepEqual(await restarted.getLoggedUsers(), []);
  assert.equal(await restarted.hasActiveUser(), false);
});

test("a token store that is not an object is ignored on load", async () => {
  writeFileSync(
    path.join(storeDir, "data", "users.json"),
    JSON.stringify(["not", "a", "store"]),
  );

  const restartedModule = "../../src/spotify/client.js?restart=array-store";
  const { default: restarted } = await import(restartedModule);

  assert.deepEqual(await restarted.getLoggedUsers(), []);
  assert.equal(await restarted.hasActiveUser(), false);
});

test("a token response without an access token is rejected", async (t) => {
  mockSpotify(t, {
    "/token": () => jsonResponse({ refresh_token: "refresh" }),
  });

  await assert.rejects(
    spotify.getUserToken({ grant_type: "authorization_code", token: "code" }),
    SpotifyResponseError,
  );
});

test("a currently-playing track without album images throws a SpotifyResponseError", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: { type: "track", name: "Song", duration_ms: 1, album: {} },
        }),
      ),
  });

  await assert.rejects(spotify.getCurrentSong(), SpotifyResponseError);
});

test("a currently-playing response with malformed fields throws a SpotifyResponseError", async (t) => {
  await login(t);

  const withoutItem: Record<string, unknown> = { ...track() };
  delete withoutItem["item"];
  const bodies: Record<string, unknown>[] = [
    withoutItem,
    track({ progress_ms: "42000" }),
    track({
      item: { type: "track", name: 5, duration_ms: 1, album: { images: [] } },
    }),
    track({
      item: {
        type: "track",
        name: "Song",
        duration_ms: 1,
        album: { images: [{ url: 7, height: 1, width: 1 }] },
      },
    }),
  ];

  for (const body of bodies) {
    mockSpotify(t, {
      "/me/player/currently-playing": () => jsonResponse(body),
    });

    await assert.rejects(spotify.getCurrentSong(), SpotifyResponseError);
  }
});

test("removeUser clears the active user and removes its tokens from the store", async (t) => {
  await login(t);

  assert.equal(await spotify.removeUser("user@example.com"), true);

  assert.equal(
    (await spotify.getLoggedUsers()).includes("user@example.com"),
    false,
  );
  assert.equal(await spotify.hasActiveUser(), false);
  const stored = JSON.parse(
    readFileSync(path.join(storeDir, "data", "users.json"), "utf8"),
  );
  assert.equal("user@example.com" in stored.users, false);
  assert.equal(stored.active_user, null);
});

test("removeUser keeps the active user when another user is removed", async (t) => {
  await login(t);
  mockSpotify(t, loginRoutes("other@example.com"));
  await spotify.getUserToken({
    grant_type: "authorization_code",
    token: "other",
  });

  assert.equal(await spotify.removeUser("user@example.com"), false);

  assert.equal(
    (await spotify.getLoggedUsers()).includes("user@example.com"),
    false,
  );
  assert.equal(await spotify.hasActiveUser(), true);
  const stored = JSON.parse(
    readFileSync(path.join(storeDir, "data", "users.json"), "utf8"),
  );
  assert.equal(stored.active_user, "other@example.com");
});

test("removeUser rejects with UserNotLoggedError for an unknown email", async () => {
  await assert.rejects(
    spotify.removeUser("nobody@example.com"),
    (error: unknown) =>
      error instanceof UserNotLoggedError &&
      error.email === "nobody@example.com",
  );
});

function statusResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return body === undefined
    ? new Response(null, { status, ...(headers && { headers }) })
    : new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      });
}

test("getCurrentSong throws SpotifyApiError with status on a 500 instead of reporting nothing playing", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      statusResponse(500, { error: { status: 500, message: "boom" } }),
  });

  await assert.rejects(
    spotify.getCurrentSong(),
    (error: unknown) =>
      error instanceof SpotifyApiError &&
      error.status === 500 &&
      error.retryAfterSeconds === undefined,
  );
});

test("getCurrentSong surfaces a 429 with Retry-After seconds", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      statusResponse(429, { error: { status: 429 } }, { "retry-after": "7" }),
  });

  await assert.rejects(
    spotify.getCurrentSong(),
    (error: unknown) =>
      error instanceof SpotifyApiError &&
      error.status === 429 &&
      error.retryAfterSeconds === 7,
  );
});

test("getCurrentSong sends a request timeout signal", async (t) => {
  await login(t);

  let signal: AbortSignal | null | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      throw new DOMException("The operation timed out.", "TimeoutError");
    },
  );

  await assert.rejects(spotify.getCurrentSong(), SpotifyRequestError);
  assert.ok(signal instanceof AbortSignal);
});

test("a stalled Spotify body read surfaces as SpotifyRequestError", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          throw new DOMException("The operation timed out.", "TimeoutError");
        },
      }) as unknown as Response,
  });

  await assert.rejects(spotify.getCurrentSong(), SpotifyRequestError);
});

test("an invalid_grant refresh removes the user's tokens and throws SpotifyAuthRevokedError", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => statusResponse(401),
    "/token": () =>
      statusResponse(400, {
        error: "invalid_grant",
        error_description: "Refresh token revoked",
      }),
  });

  await assert.rejects(
    spotify.getCurrentSong(),
    (error: unknown) =>
      error instanceof SpotifyAuthRevokedError &&
      error.email === "user@example.com",
  );

  assert.equal(
    (await spotify.getLoggedUsers()).includes("user@example.com"),
    false,
  );
  assert.equal(await spotify.hasActiveUser(), false);
  const stored = JSON.parse(
    readFileSync(path.join(storeDir, "data", "users.json"), "utf8"),
  );
  assert.equal("user@example.com" in stored.users, false);
  assert.equal(stored.active_user, null);
});

test("a 500 on refresh keeps the user's tokens for a later retry", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => statusResponse(401),
    "/token": () => statusResponse(500),
  });

  await assert.rejects(
    spotify.getCurrentSong(),
    (error: unknown) =>
      error instanceof SpotifyApiError &&
      error.path === "/token" &&
      error.status === 500,
  );

  assert.equal(await spotify.hasActiveUser(), true);
  assert.deepEqual(
    (await spotify.getLoggedUsers()).includes("user@example.com"),
    true,
  );
});
