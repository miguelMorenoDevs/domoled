import { test } from "node:test";
import assert from "node:assert/strict";
import { dominantColor } from "../../src/utils/color.js";

test("dominantColor: picks the most common colour and averages it", () => {
  const red = [200, 30, 40, 255];
  const blue = [20, 60, 220, 255];
  const pixels = [...red, ...red, ...red, ...blue];
  assert.deepEqual(dominantColor(pixels), { r: 200, g: 30, b: 40 });
});

test("dominantColor: a saturated colour beats a larger grey area", () => {
  const grey = [120, 120, 120, 255];
  const orange = [230, 130, 20, 255];
  const pixels = [...grey, ...grey, ...grey, ...orange, ...orange];
  assert.deepEqual(dominantColor(pixels), { r: 230, g: 130, b: 20 });
});

test("dominantColor: skips transparent pixels and handles none", () => {
  assert.deepEqual(dominantColor([255, 0, 0, 0]), { r: 0, g: 0, b: 0 });
  assert.deepEqual(dominantColor([]), { r: 0, g: 0, b: 0 });
});
