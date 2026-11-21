import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  return ip === "::1" || ip.startsWith("127.");
}

// User admin routes list and switch accounts, so only the local machine may call them.
export function requireLoopback(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (isLoopbackAddress(req.socket.remoteAddress)) {
    next();
    return;
  }
  res.sendStatus(403);
}

export function warnIfTvTokenUnset(): void {
  if (!process.env["TV_TOKEN"])
    console.warn(
      "TV_TOKEN is not set: the TV account routes will reject the TV with 403.",
    );
}

// Hashing first makes both buffers the same length, which timingSafeEqual requires.
function sameToken(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// The TV sends the shared TV_TOKEN in X-TV-Token; loopback callers (the simulator) pass without it.
// An unset TV_TOKEN rejects everyone who is not on loopback.
export function requireTv(req: Request, res: Response, next: NextFunction) {
  if (isLoopbackAddress(req.socket.remoteAddress)) {
    next();
    return;
  }
  const expected = process.env["TV_TOKEN"];
  const given = req.get("X-TV-Token");
  if (expected && given !== undefined && sameToken(given, expected)) {
    next();
    return;
  }
  res.sendStatus(403);
}
