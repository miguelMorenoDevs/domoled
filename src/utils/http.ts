import type {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from "express";

// Lets the TV app (loaded from file://, so its origin is "null") call a LAN route, JSON preflight included.
export function allowAnyOrigin(
  req: Request,
  res: ExpressResponse,
  next: NextFunction,
): void {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method !== "OPTIONS") {
    next();
    return;
  }
  res.set({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-TV-Token",
  });
  res.sendStatus(204);
}

export function parseRetryAfter(res: Response): number | undefined {
  const value = res.headers.get("retry-after");
  if (value === null) return undefined;

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
