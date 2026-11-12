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
