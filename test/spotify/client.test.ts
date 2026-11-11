import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

const storeDir = mkdtempSync(path.join(os.tmpdir(), "domoled-test-"));
process.chdir(storeDir);

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
    title: "Song",
    image: "https://img/640",
    durationMs: 200000,
    progressMs: 42000,
  });
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

test("getCurrentSong returns undefined for episodes", async (t) => {
  await login(t);
  mockSpotify(t, {
    "/me/player/currently-playing": () =>
      jsonResponse(
        track({
          item: { type: "episode", name: "Episode" },
          currently_playing_type: "episode",
        }),
      ),
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
