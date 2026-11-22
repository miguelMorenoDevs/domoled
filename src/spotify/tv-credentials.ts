import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isStoredTvCredentials,
  type StoredTvCredentials,
} from "./types/api.js";

const STORE_PATH = path.resolve("data", "tv-credentials.json");

/** The client id librespot uses; login5 accepts only tokens minted with it. */
export const KEYMASTER_CLIENT_ID = "65b708073fc0480ea92a077233ca87bd";

function readStore(): StoredTvCredentials {
  let raw: string;
  try {
    raw = readFileSync(STORE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  const store: unknown = JSON.parse(raw);
  // Refuse to overwrite a file we cannot read: it would drop the other accounts.
  if (!isStoredTvCredentials(store))
    throw new TypeError(`${STORE_PATH} does not match the expected shape`);
  return store;
}

function writeStore(store: StoredTvCredentials): void {
  mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tmpPath = STORE_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmpPath, STORE_PATH);
}

/** Adds or replaces one account's keymaster refresh token; other accounts are kept. */
export function saveTvCredential(userId: string, refreshToken: string): void {
  const store = readStore();
  store[userId] = { refresh_token: refreshToken };
  writeStore(store);
}

export function getTvCredential(userId: string): string | undefined {
  return readStore()[userId]?.refresh_token;
}

export function removeTvCredential(userId: string): void {
  const store = readStore();
  delete store[userId];
  writeStore(store);
}
