import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";

process.env["SPOTIFY_CLIENT_ID"] ??= "test-client-id";
process.env["SPOTIFY_CLIENT_SECRET"] ??= "test-client-secret";

const { isLoopbackAddress, requireLoopback } =
  await import("../../src/spotify/guard.js");

function runGuard(remoteAddress: string | undefined) {
  const req = { socket: { remoteAddress } } as unknown as Request;
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
  requireLoopback(req, res, next);
  return calls;
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
