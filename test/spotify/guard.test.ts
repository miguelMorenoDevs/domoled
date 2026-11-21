import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

const { isLoopbackAddress, requireLoopback, requireTv } =
  await import("../../src/spotify/guard.js");

function runGuard(
  remoteAddress: string | undefined,
  guard: typeof requireLoopback = requireLoopback,
  tvToken?: string,
) {
  const req = {
    socket: { remoteAddress },
    get: (name: string) => (name === "X-TV-Token" ? tvToken : undefined),
  } as unknown as Request;
  const calls: { status?: number; next: boolean } = { next: false };
  const res = {
    sendStatus(status: number) {
      calls.status = status;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    calls.next = true;
  };
  guard(req, res, next);
  return calls;
}

function runTvGuard(remoteAddress: string | undefined, tvToken?: string) {
  return runGuard(remoteAddress, requireTv, tvToken);
}

test("loopback addresses pass the admin guard", () => {
  for (const address of [
    "127.0.0.1",
    "127.8.9.10",
    "::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.deepEqual(runGuard(address), { next: true }, address);
  }
});

test("non-loopback addresses get 403 from the admin guard", () => {
  for (const address of [
    "192.168.1.20",
    "10.0.0.5",
    "::ffff:192.168.1.20",
    "2001:db8::1",
    "1270.0.0.1",
  ]) {
    assert.deepEqual(runGuard(address), { status: 403, next: false }, address);
  }
});

test("a missing socket address is rejected", () => {
  assert.equal(isLoopbackAddress(undefined), false);
  assert.deepEqual(runGuard(undefined), { status: 403, next: false });
});

test("requireTv passes the matching X-TV-Token from the LAN", () => {
  process.env["TV_TOKEN"] = "secret";
  try {
    assert.deepEqual(runTvGuard("192.168.1.20", "secret"), { next: true });
  } finally {
    delete process.env["TV_TOKEN"];
  }
});

test("requireTv rejects a LAN caller with a missing or wrong token", () => {
  process.env["TV_TOKEN"] = "secret";
  try {
    assert.deepEqual(runTvGuard("192.168.1.20"), { status: 403, next: false });
    assert.deepEqual(runTvGuard("192.168.1.20", ""), {
      status: 403,
      next: false,
    });
    assert.deepEqual(runTvGuard("192.168.1.20", "secre"), {
      status: 403,
      next: false,
    });
    assert.deepEqual(runTvGuard("192.168.1.20", "secret!"), {
      status: 403,
      next: false,
    });
  } finally {
    delete process.env["TV_TOKEN"];
  }
});

test("requireTv lets loopback through without a token", () => {
  process.env["TV_TOKEN"] = "secret";
  try {
    assert.deepEqual(runTvGuard("127.0.0.1"), { next: true });
  } finally {
    delete process.env["TV_TOKEN"];
  }
});

test("requireTv fails closed when TV_TOKEN is unset", () => {
  delete process.env["TV_TOKEN"];
  assert.deepEqual(runTvGuard("192.168.1.20", ""), {
    status: 403,
    next: false,
  });
  assert.deepEqual(runTvGuard("192.168.1.20", "secret"), {
    status: 403,
    next: false,
  });
});
