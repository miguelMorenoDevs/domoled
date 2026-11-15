import { test } from "node:test";
import assert from "node:assert/strict";
import { qrModules } from "../../src/utils/qr.js";

// Each finder pattern is a 7x7 square: a dark outer ring and a dark 3x3 centre.
function finderIsDrawn(modules: boolean[][], row: number, column: number) {
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const ring = i === 0 || i === 6 || j === 0 || j === 6;
      const centre = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      if (modules[row + i]?.[column + j] !== (ring || centre)) return false;
    }
  }
  return true;
}

test("qrModules returns a square grid with the three finder patterns", () => {
  const modules = qrModules("http://192.168.1.10:3000/connect.html");
  const size = modules.length;

  assert.ok(size >= 21 && (size - 17) % 4 === 0, `unexpected size ${size}`);
  assert.ok(modules.every((row) => row.length === size));
  assert.ok(finderIsDrawn(modules, 0, 0));
  assert.ok(finderIsDrawn(modules, 0, size - 7));
  assert.ok(finderIsDrawn(modules, size - 7, 0));
});

test("qrModules is deterministic for the same link", () => {
  const url = "http://10.0.0.2:3000/connect.html";
  assert.deepEqual(qrModules(url), qrModules(url));
});
