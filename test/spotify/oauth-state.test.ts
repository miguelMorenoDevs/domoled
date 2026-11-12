import { test } from "node:test";
import assert from "node:assert/strict";

const { consumeOAuthState, createOAuthState } =
  await import("../../src/spotify/oauth-state.js");

test("a state created for a host is accepted once", () => {
  const state = createOAuthState("192.168.1.20:3000");
  assert.match(state, /^[0-9a-f]{32}\.192\.168\.1\.20:3000$/);
  assert.equal(consumeOAuthState(state), true);
  assert.equal(consumeOAuthState(state), false);
});

test("missing and unknown states are rejected", () => {
  createOAuthState("192.168.1.20:3000");
  assert.equal(consumeOAuthState(undefined), false);
  assert.equal(consumeOAuthState(""), false);
  assert.equal(consumeOAuthState("192.168.1.20:3000"), false);
  assert.equal(consumeOAuthState("deadbeef.192.168.1.20:3000"), false);
});

test("a nonce cannot be reused with a different host", () => {
  const state = createOAuthState("192.168.1.20:3000");
  const nonce = state.slice(0, state.indexOf("."));
  assert.equal(consumeOAuthState(nonce + ".10.0.0.5:3000"), false);
  assert.equal(consumeOAuthState(state), true);
});

test("expired states are rejected", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const state = createOAuthState("192.168.1.20:3000");
  t.mock.timers.tick(10 * 60_000);
  assert.equal(consumeOAuthState(state), false);
});

test("each login attempt gets a different nonce", () => {
  const first = createOAuthState("192.168.1.20:3000");
  const second = createOAuthState("192.168.1.20:3000");
  assert.notEqual(first, second);
  assert.equal(consumeOAuthState(first), true);
  assert.equal(consumeOAuthState(second), true);
});
