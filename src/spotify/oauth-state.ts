import { randomBytes } from "node:crypto";

const STATE_TTL_MS = 10 * 60_000;

const pending = new Map<string, number>();

// The state is `<random nonce>.<host:port>`. The nonce is the trust anchor; the host only tells the GitHub Pages page where to forward the code.
export function createOAuthState(host: string): string {
  pruneExpired();
  const state = randomBytes(16).toString("hex") + "." + host;
  pending.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

// Single use: a valid state is removed on the first check so a replayed callback is rejected.
export function consumeOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  const expiresAt = pending.get(state);
  pending.delete(state);
  return expiresAt !== undefined && expiresAt > Date.now();
}

function pruneExpired() {
  const now = Date.now();
  for (const [state, expiresAt] of pending) {
    if (expiresAt <= now) pending.delete(state);
  }
}
