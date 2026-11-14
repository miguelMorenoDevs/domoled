import { test } from "node:test";
import assert from "node:assert/strict";
import { BaseAnimation } from "../../src/animator/base.js";
import { animationPhaseAt } from "../../src/animator/timing.js";
import type { AnimationFrame } from "../../src/animator/types.js";

const introMs = 1000;
const outroMs = 500;

class ProbeAnimation extends BaseAnimation<null> {
  constructor(trackMs: number | null = null) {
    super(introMs, outroMs, trackMs);
  }

  protected override draw(): void {}
}

function frameAt(elapsedMs: number): AnimationFrame<null> {
  return {
    ctx: null,
    width: 64,
    height: 64,
    elapsedMs,
  };
}

test("animation phases: intro once, then loop until exit", () => {
  assert.deepEqual(animationPhaseAt(0, null, introMs, outroMs), {
    phase: "intro",
    elapsedInPhaseMs: 0,
  });
  assert.equal(
    animationPhaseAt(introMs - 1, null, introMs, outroMs).phase,
    "intro",
  );
  assert.deepEqual(animationPhaseAt(introMs, null, introMs, outroMs), {
    phase: "loop",
    elapsedInPhaseMs: 0,
  });
  assert.equal(animationPhaseAt(600_000, null, introMs, outroMs).phase, "loop");
});

test("animation outro plays once after exit, then the animation is done", () => {
  const exitAt = introMs + 3000;

  assert.equal(
    animationPhaseAt(exitAt - 1, exitAt, introMs, outroMs).phase,
    "loop",
  );
  assert.deepEqual(animationPhaseAt(exitAt, exitAt, introMs, outroMs), {
    phase: "outro",
    elapsedInPhaseMs: 0,
  });
  assert.equal(
    animationPhaseAt(exitAt + outroMs - 1, exitAt, introMs, outroMs).phase,
    "outro",
  );
  assert.equal(
    animationPhaseAt(exitAt + outroMs, exitAt, introMs, outroMs).phase,
    "done",
  );
});

test("exit requested during the intro waits for the intro to finish", () => {
  const animation = new ProbeAnimation();
  animation.exit(100);
  assert.equal(animation.exiting, true);

  animation.render(frameAt(introMs - 1));
  assert.equal(animation.finished, false);

  animation.render(frameAt(introMs + outroMs));
  assert.equal(animation.finished, true);
});

test("a track holds at its end until exit(), without an outro of its own", () => {
  const animation = new ProbeAnimation(5000);
  assert.equal(animation.holdsAt(4999), false);
  assert.equal(animation.holdsAt(5000), true);

  animation.render(frameAt(6000));
  assert.equal(animation.exiting, false);
  assert.equal(animation.finished, false);
  assert.equal(animation.holdsAt(9000), true);

  animation.exit(6000);
  assert.equal(animation.holdsAt(9000), false);
  animation.render(frameAt(6000 + outroMs));
  assert.equal(animation.finished, true);
});

test("animations without a track never hold", () => {
  assert.equal(new ProbeAnimation().holdsAt(600_000), false);
});
