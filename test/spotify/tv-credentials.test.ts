import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const storeDir = mkdtempSync(path.join(os.tmpdir(), "domoled-test-"));
process.chdir(storeDir);

const {
  getPendingTvCredential,
  removePendingTvCredential,
  savePendingTvCredential,
  saveTvCredential,
} = await import("../../src/spotify/tv-credentials.js");

const storePath = path.join(storeDir, "data", "tv-credentials.json");
const pendingPath = path.join(storeDir, "data", "tv-credentials.pending.json");

test("a pending credential round-trips with mode 0600 and is removed", () => {
  assert.equal(getPendingTvCredential(), undefined);

  savePendingTvCredential("refresh-p");
  assert.equal(getPendingTvCredential(), "refresh-p");
  assert.equal(statSync(pendingPath).mode & 0o777, 0o600);

  removePendingTvCredential();
  assert.equal(getPendingTvCredential(), undefined);
  removePendingTvCredential();
});

test("getPendingTvCredential refuses a malformed pending file", () => {
  writeFileSync(pendingPath, JSON.stringify({ refresh_token: 1 }));
  assert.throws(() => getPendingTvCredential());
  removePendingTvCredential();
});

test("saveTvCredential keeps other accounts and stores with mode 0600", () => {
  saveTvCredential("alice", "refresh-a");
  saveTvCredential("bob", "refresh-b");

  assert.deepEqual(JSON.parse(readFileSync(storePath, "utf8")), {
    alice: { refresh_token: "refresh-a" },
    bob: { refresh_token: "refresh-b" },
  });
  assert.equal(statSync(storePath).mode & 0o777, 0o600);
});

test("saveTvCredential refuses to overwrite an unreadable store", () => {
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, "{ not json");

  assert.throws(() => saveTvCredential("carol", "refresh-c"));
  assert.equal(readFileSync(storePath, "utf8"), "{ not json");
});
