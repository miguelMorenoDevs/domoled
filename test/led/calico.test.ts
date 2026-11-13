import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CALICO_TIMING } from "../../src/animator/timing.js";
import { standStretchAt } from "../../src/led/animations/calico.js";

const timing = DEFAULT_CALICO_TIMING;

test("calico sleeps 10 s, then stands and stretches, in a loop", () => {
  const mid = timing.sleepMs + timing.stretchMs / 2;
  const asleep = { stand: 0, stretch: 0 };
  const awake = { stand: 1, stretch: 1 };

  assert.deepEqual(standStretchAt(0, timing), asleep);
  assert.deepEqual(standStretchAt(timing.sleepMs - 1, timing), asleep);
  assert.deepEqual(standStretchAt(mid, timing), awake);
  assert.deepEqual(
    standStretchAt(timing.sleepMs + timing.stretchMs, timing),
    asleep,
  );
  assert.deepEqual(
    standStretchAt(timing.sleepMs + timing.stretchMs + mid, timing),
    awake,
  );
});
