import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackClock } from "../../src/utils/clock.js";

function clockAt() {
  let now = 1_000;
  const clock = new PlaybackClock(() => now);
  return { clock, advance: (ms: number) => (now += ms) };
}

test("playback clock: pause, wait, resume keeps the same elapsed time", () => {
  const { clock, advance } = clockAt();
  clock.start(5_000);
  advance(2_000);
  assert.equal(clock.elapsedMs(), 7_000);

  clock.pause();
  assert.equal(clock.paused, true);
  advance(60_000);
  assert.equal(clock.elapsedMs(), 7_000);

  clock.resume();
  assert.equal(clock.paused, false);
  advance(500);
  assert.equal(clock.elapsedMs(), 7_500);
});

test("playback clock: seek sets the position while playing or paused", () => {
  const { clock, advance } = clockAt();
  clock.start(0);
  advance(1_000);
  clock.seek(90_000);
  assert.equal(clock.elapsedMs(), 90_000);
  advance(250);
  assert.equal(clock.elapsedMs(), 90_250);

  clock.pause();
  clock.seek(12_000);
  advance(10_000);
  assert.equal(clock.elapsedMs(), 12_000);
  clock.resume();
  advance(1_000);
  assert.equal(clock.elapsedMs(), 13_000);
});

test("playback clock: pause and resume are idempotent", () => {
  const { clock, advance } = clockAt();
  clock.start(0);
  advance(100);
  clock.resume();
  assert.equal(clock.elapsedMs(), 100);
  clock.pause();
  clock.pause();
  advance(100);
  assert.equal(clock.elapsedMs(), 100);
});
