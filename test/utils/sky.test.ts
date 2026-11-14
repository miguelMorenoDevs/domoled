import { test } from "node:test";
import assert from "node:assert/strict";
import { skyAt } from "../../src/utils/sky.js";

test("skyAt: noon is full daylight with the sun at its peak", () => {
  const sky = skyAt(12);
  assert.equal(sky.isDay, true);
  assert.equal(sky.night, 0);
  assert.equal(sky.stars, 0);
  assert.equal(sky.bodyX, 0.5);
  assert.ok(Math.abs(sky.bodyY - (150 - 110) / 225) < 1e-9);
  assert.equal(sky.bodyColor, "rgb(255, 244, 184)");
  assert.equal(sky.glowOpacity, 1);
});

test("skyAt: late night is dark, starry and shows the moon", () => {
  const sky = skyAt(23);
  assert.equal(sky.isDay, false);
  assert.ok(sky.night > 0.35);
  assert.equal(sky.stars, 1);
  assert.ok(sky.bodyX > 0.4 && sky.bodyX < 0.5);
  assert.ok(sky.bodyY > 0.1 && sky.bodyY < 0.4);
  assert.equal(sky.glowOpacity, 0.45);
});

test("skyAt: switches to day at 05:30 and to night at 18:30", () => {
  assert.equal(skyAt(5.4).isDay, false);
  assert.equal(skyAt(5.5).isDay, true);
  assert.equal(skyAt(18.4).isDay, true);
  assert.equal(skyAt(18.5).isDay, false);
});

test("skyAt: colours come straight from the keyframes", () => {
  assert.equal(skyAt(9).skyTop, "rgb(127, 195, 238)");
  assert.equal(skyAt(13).skyTop, "rgb(111, 185, 236)");
  assert.equal(skyAt(9).ground, "rgb(124, 196, 122)");
});

test("skyAt: midnight and 24:00 are the same", () => {
  assert.deepEqual(skyAt(24), skyAt(0));
});

test("skyAt: the sun sets redder and the night overlay fades at dusk", () => {
  const dusk = skyAt(17.5);
  assert.equal(dusk.isDay, true);
  assert.ok(dusk.night > 0 && dusk.night < 0.1);
  assert.notEqual(dusk.bodyColor, "rgb(255, 244, 184)");
});
