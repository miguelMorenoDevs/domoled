import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { allowAnyOrigin } from "../../src/utils/http.js";

function run(method: string) {
  const headers: Record<string, string> = {};
  const calls: { status?: number; next: boolean } = { next: false };
  const req = { method } as unknown as Request;
  const res = {
    set(name: string, value?: string) {
      if (typeof name === "object") Object.assign(headers, name);
      else headers[name] = value ?? "";
      return this;
    },
    sendStatus(status: number) {
      calls.status = status;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    calls.next = true;
  };
  allowAnyOrigin(req, res, next);
  return { calls, headers };
}

test("a GET passes through with the CORS origin header", () => {
  const { calls, headers } = run("GET");
  assert.deepEqual(calls, { next: true });
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
});

test("an OPTIONS preflight is answered 204 without calling the route", () => {
  const { calls, headers } = run("OPTIONS");
  assert.deepEqual(calls, { status: 204, next: false });
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
  assert.equal(
    headers["Access-Control-Allow-Headers"],
    "Content-Type, X-TV-Token",
  );
  assert.match(headers["Access-Control-Allow-Methods"] ?? "", /POST/);
});
