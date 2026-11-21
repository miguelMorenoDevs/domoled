import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

process.chdir(mkdtempSync(path.join(os.tmpdir(), "domoled-test-")));

// The animator loads the Pi's native matrix driver through eval("require"), which ESM does not
// have, so the test supplies a stub for that one module before the routes import the animator.
class StubLedMatrix {
  static defaultMatrixOptions() {
    return {};
  }
  static defaultRuntimeOptions() {
    return {};
  }
  width() {
    return 64;
  }
  height() {
    return 64;
  }
}
Object.assign(globalThis, {
  require: (id: string) => {
    if (id !== "rpi-led-matrix") throw new Error(`Unexpected require: ${id}`);
    return { LedMatrix: StubLedMatrix };
  },
});

const { default: spotify, SpotifyAuthRevokedError } =
  await import("../../src/spotify/client.js");
const { default: spotifyRouter, loginQrUrl } =
  await import("../../src/spotify/routes.js");
const { cdAnimator } = await import("../../src/led/animator.js");

async function startServer(): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use("/spotify", spotifyRouter);
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

test("a revoked login answers 401 and brings the login QR back", async (t: TestContext) => {
  const { server, url } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  t.mock.method(spotify, "getStreamToken", async () => {
    throw new SpotifyAuthRevokedError("user-id");
  });
  const showQr = t.mock.method(cdAnimator, "showQr", () => {});

  const response = await fetch(`${url}/spotify/stream-token`);

  assert.equal(response.status, 401);
  assert.equal(
    await response.text(),
    "Spotify login expired. Log in again from the TV.",
  );
  assert.equal(showQr.mock.callCount(), 1);
  assert.deepEqual(showQr.mock.calls[0]?.arguments, [loginQrUrl()]);
});
