import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

const { default: spotify } = await import("../../src/spotify/client.js");



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

function loginRoutes(email = "user@example.com"): Record<string, () => Response> {
  return {
    "/token": () => jsonResponse({ access_token: "access", refresh_token: "refresh" }),
    "/me": () => jsonResponse({ email }),
  };
}

async function login(t: TestContext) {
  mockSpotify(t, loginRoutes());
  await spotify.getUserToken({ grant_type: "authorization_code", token: "code" });
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

test("login stores the user under their email and makes it active", async (t) => {
  await login(t);

  assert.ok((await spotify.getLoggedUsers()).includes("user@example.com"));
  assert.equal(await spotify.hasActiveUser(), true);
});

test("getCurrentSong returns the largest square album image", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => jsonResponse(track()),
  });

  assert.deepEqual(await spotify.getCurrentSong(), {
    title: "Song",
    image: "https://img/640",
    durationMs: 200000,
    progressMs: 42000,
  });
});

test("getCurrentSong defaults progressMs to 0 when Spotify returns null", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () => jsonResponse(track({ progress_ms: null })),
  });

  const song = await spotify.getCurrentSong();

  assert.equal(song?.progressMs, 0);
});

test("getCurrentSong returns undefined for episodes", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(track({ item: { type: "episode", name: "Episode" }, currently_playing_type: "episode" })),
  });

  assert.equal(await spotify.getCurrentSong(), undefined);
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
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/token")) {
      refreshCalls++;
      assert.equal(String(init?.body).includes("grant_type=refresh_token"), true);
      return jsonResponse({ access_token: "new-access" });
    }
    if (url.endsWith("/me/player/currently-playing")) {
      playingCalls++;
      if (playingCalls === 1) return new Response(null, { status: 401 });
      assert.equal((init?.headers as Record<string, string>)["Authorization"], "Bearer new-access");
      return jsonResponse(track());
    }
    throw new Error("Unexpected fetch: " + url);
  });

  const song = await spotify.getCurrentSong();

  assert.equal(song?.title, "Song");
  assert.equal(refreshCalls, 1);
  assert.equal(playingCalls, 2);
});
