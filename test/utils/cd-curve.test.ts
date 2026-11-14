import { test } from "node:test";
import assert from "node:assert/strict";
import { cdCurveAt } from "../../src/utils/cd-curve.js";

const introMs = 2000;
const outroMs = 5000;

test("cd intro fades in from 0 and reaches full opacity at its midpoint", () => {
  assert.equal(
    cdCurveAt({ phase: "intro", elapsedInPhaseMs: 0 }, introMs, outroMs)
      .opacity,
    0,
  );
  assert.equal(
    cdCurveAt(
      { phase: "intro", elapsedInPhaseMs: introMs / 2 },
      introMs,
      outroMs,
    ).opacity,
    1,
  );
});

test("cd outro holds full opacity until its midpoint, then fades to 0", () => {
  assert.equal(
    cdCurveAt(
      { phase: "outro", elapsedInPhaseMs: outroMs / 2 },
      introMs,
      outroMs,
    ).opacity,
    1,
  );
  assert.equal(
    cdCurveAt(
      { phase: "outro", elapsedInPhaseMs: outroMs - 1 },
      introMs,
      outroMs,
    ).opacity < 0.01,
    true,
  );
});

test("cd outro is the intro played in reverse over outroMs", () => {
  for (const elapsed of [0, 250, 1000, 3000, 4500]) {
    const outro = cdCurveAt(
      { phase: "outro", elapsedInPhaseMs: elapsed },
      introMs,
      outroMs,
    );
    const intro = cdCurveAt(
      { phase: "intro", elapsedInPhaseMs: outroMs - elapsed },
      outroMs,
      outroMs,
    );
    assert.ok(Math.abs(outro.offscreen - intro.offscreen) < 1e-9);
  }
});

test("cd is centred and fully opaque in the loop", () => {
  assert.deepEqual(
    cdCurveAt({ phase: "loop", elapsedInPhaseMs: 10_000 }, introMs, outroMs),
    { opacity: 1, offscreen: 0 },
  );
});

test("cd intro starts fully below the screen and ends centred", () => {
  assert.equal(
    cdCurveAt({ phase: "intro", elapsedInPhaseMs: 0 }, introMs, outroMs)
      .offscreen,
    1,
  );
  assert.equal(
    cdCurveAt({ phase: "intro", elapsedInPhaseMs: introMs }, introMs, outroMs)
      .offscreen,
    0,
  );
});
