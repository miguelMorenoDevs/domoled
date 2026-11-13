import { Router } from "express";
import type { Request, Response } from "express";
import { cdAnimator } from "./animator.js";

const router: Router = Router();

// Server-Sent Events: the LG TV app mirrors the animation from these state changes.
router.get("/state", (req: Request, res: Response) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders();

  const unsubscribe = cdAnimator.subscribe((state) => {
    res.write(`data: ${JSON.stringify(state)}\n\n`);
  });
  req.on("close", unsubscribe);
});

export default router;
