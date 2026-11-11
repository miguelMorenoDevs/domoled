import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calicoActiveMs,
  calicoPhaseAt,
  DEFAULT_CALICO_TIMING,
} from "../../src/led/animations/calico.js";

const timing = DEFAULT_CALICO_TIMING;

test("calico cycle phases switch at intro, loop and outro boundaries", () => {
  const introEnd = timing.introJumpMs + timing.introSettleMs;
  const loopEnd = introEnd + timing.lickPeriodMs * timing.lickCount;
  const outroEnd = loopEnd + timing.outroDurationMs;

  assert.equal(calicoPhaseAt(0, timing).phase, "intro");
  assert.equal(calicoPhaseAt(timing.introJumpMs - 1, timing).phase, "intro");
  assert.deepEqual(calicoPhaseAt(introEnd - 1, timing), {
    phase: "intro",
    elapsedInPhaseMs: introEnd - 1,
  });
  assert.deepEqual(calicoPhaseAt(introEnd, timing), {
    phase: "loop",
    elapsedInPhaseMs: 0,
  });
  assert.equal(calicoPhaseAt(loopEnd - 1, timing).phase, "loop");
  assert.deepEqual(calicoPhaseAt(loopEnd, timing), {
    phase: "outro",
    elapsedInPhaseMs: 0,
  });
  assert.equal(calicoPhaseAt(outroEnd - 1, timing).phase, "outro");
  assert.deepEqual(calicoPhaseAt(outroEnd, timing), {
    phase: "pause",
    elapsedInPhaseMs: 0,
  });
});

test("calicoActiveMs covers intro, loop and outro without the pause", () => {
  assert.equal(
    calicoActiveMs(timing),
    timing.introJumpMs +
      timing.introSettleMs +
      timing.lickPeriodMs * timing.lickCount +
      timing.outroDurationMs,
  );
  assert.equal(calicoPhaseAt(calicoActiveMs(timing), timing).phase, "pause");
});
