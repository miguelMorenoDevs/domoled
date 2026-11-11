import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calicoPhaseAt,
  CalicoCatAnimation,
  DEFAULT_CALICO_TIMING,
  stretchAt,
} from "../../src/led/animations/calico.js";

const timing = DEFAULT_CALICO_TIMING;
const introEnd = timing.introJumpMs + timing.introSettleMs;

test("calico intro plays once, then loops without an exit", () => {
  assert.deepEqual(calicoPhaseAt(0, null, timing), {
    phase: "intro",
    elapsedInPhaseMs: 0,
  });
  assert.equal(calicoPhaseAt(introEnd - 1, null, timing).phase, "intro");
  assert.deepEqual(calicoPhaseAt(introEnd, null, timing), {
    phase: "loop",
    elapsedInPhaseMs: 0,
  });
  assert.equal(calicoPhaseAt(10 * 60_000, null, timing).phase, "loop");
});

test("calico outro plays once after exit, then the cat is done", () => {
  const exitAt = introEnd + 3000;

  assert.equal(calicoPhaseAt(exitAt - 1, exitAt, timing).phase, "loop");
  assert.deepEqual(calicoPhaseAt(exitAt, exitAt, timing), {
    phase: "outro",
    elapsedInPhaseMs: 0,
  });
  assert.equal(
    calicoPhaseAt(exitAt + timing.outroDurationMs - 1, exitAt, timing).phase,
    "outro",
  );
  assert.equal(
    calicoPhaseAt(exitAt + timing.outroDurationMs, exitAt, timing).phase,
    "done",
  );
});

test("calico stretches once every 10 s, then sleeps", () => {
  const stretched: boolean[] = [];
  for (let ms = 0; ms < timing.stretchPeriodMs; ms += 10)
    stretched.push(stretchAt(ms, timing) > 0.5);

  const runs = stretched.filter((on, i) => on && !stretched[i - 1]).length;
  assert.equal(runs, 1);
  assert.equal(stretchAt(0, timing), 0);
  assert.equal(stretchAt(timing.stretchPeriodMs, timing), 0);
  assert.equal(
    stretchAt(timing.stretchPeriodMs + timing.stretchMs / 2, timing),
    1,
  );
});

test("calico exit requested during the intro waits for the intro to finish", () => {
  const cat = new CalicoCatAnimation();
  cat.exit(100);

  assert.equal(cat.exiting, true);
  assert.equal(cat.finished, false);
  assert.equal(calicoPhaseAt(introEnd, introEnd, timing).phase, "outro");
});
