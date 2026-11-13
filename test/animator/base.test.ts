import { test } from "node:test";
import assert from "node:assert/strict";
import { BaseAnimation } from "../../src/animator/base.js";
import { animationPhaseAt } from "../../src/animator/timing.js";
import type { AnimationFrame } from "../../src/animator/types.js";

const introMs = 1000;
const outroMs = 500;

class ProbeAnimation extends BaseAnimation<null> {
  constructor(private readonly endMs: number | null = null) {
    super(introMs, outroMs);
  }

  protected override scheduledExitMs(): number | null {
    return this.endMs === null ? null : this.endMs - outroMs;
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

test("a scheduled end (track end) starts the outro without exit()", () => {
  const animation = new ProbeAnimation(5000);
  assert.equal(animation.exiting, false);

  animation.render(frameAt(4499));
  assert.equal(animation.finished, false);

  animation.render(frameAt(5000));
  assert.equal(animation.finished, true);
});

test("exit() after a scheduled end keeps the outro in progress", () => {
  const animation = new ProbeAnimation(5000);
  animation.render(frameAt(4800));
  animation.exit(4800);

  animation.render(frameAt(5000));
  assert.equal(animation.finished, true);
});
