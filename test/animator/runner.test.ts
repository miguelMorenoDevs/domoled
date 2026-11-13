import { test } from "node:test";
import assert from "node:assert/strict";
import { AnimationRunner } from "../../src/animator/runner.js";
import type { Animation } from "../../src/animator/types.js";

function probe(exits: number[]): Animation<null> {
  return {
    exiting: false,
    finished: false,
    exit(elapsedMs) {
      exits.push(elapsedMs);
    },
    render() {},
  };
}

test("waitForExit does nothing when no animation runs", () => {
  const runner = new AnimationRunner<null>();
  assert.equal(
    runner.waitForExit(() => {}),
    false,
  );
});

test("waitForExit exits the running animation at its elapsed time and keeps the next callback", () => {
  const runner = new AnimationRunner<null>();
  const exits: number[] = [];
  const next = () => {};

  runner.start(probe(exits), 1000, null);
  assert.equal(runner.waitForExit(next), true);

  assert.equal(exits.length, 1);
  assert.ok(exits[0]! >= 1000);
  assert.equal(runner.afterExit, next);

  runner.clear();
  assert.equal(runner.current, null);
  assert.equal(runner.afterExit, null);
});

test("pause and resume report whether they changed the running animation", () => {
  const runner = new AnimationRunner<null>();
  assert.equal(runner.pause(), false);

  runner.start(probe([]), 0, null);
  assert.equal(runner.pause(), true);
  assert.equal(runner.pause(), false);
  assert.equal(runner.resume(), true);
  assert.equal(runner.resume(), false);
});
