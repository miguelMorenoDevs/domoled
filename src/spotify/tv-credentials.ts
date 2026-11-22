import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  isStoredTvCredentials,
  isTvCredential,
  type StoredTvCredentials,
} from "./types/api.js";

const STORE_PATH = path.resolve("data", "tv-credentials.json");
const PENDING_PATH = path.resolve("data", "tv-credentials.pending.json");

/** The client id librespot uses; login5 accepts only tokens minted with it. */
export const KEYMASTER_CLIENT_ID = "65b708073fc0480ea92a077233ca87bd";

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmpPath, filePath);
}

function readStore(): StoredTvCredentials {
  const store = readJson(STORE_PATH);
  if (store === undefined) return {};
  // Refuse to overwrite a file we cannot read: it would drop the other accounts.
  if (!isStoredTvCredentials(store))
    throw new TypeError(`${STORE_PATH} does not match the expected shape`);
  return store;
}

/** Adds or replaces one account's keymaster refresh token; other accounts are kept. */
export function saveTvCredential(userId: string, refreshToken: string): void {
  const store = readStore();
  store[userId] = { refresh_token: refreshToken };
  writeJson(STORE_PATH, store);
}

/** Holds a freshly exchanged refresh token until its Spotify user id is known. */
export function savePendingTvCredential(refreshToken: string): void {
  writeJson(PENDING_PATH, { refresh_token: refreshToken });
}

export function getPendingTvCredential(): string | undefined {
  const pending = readJson(PENDING_PATH);
  if (pending === undefined) return undefined;
  if (!isTvCredential(pending))
    throw new TypeError(`${PENDING_PATH} does not match the expected shape`);
  return pending.refresh_token;
}

export function removePendingTvCredential(): void {
  rmSync(PENDING_PATH, { force: true });
}

export function getTvCredential(userId: string): string | undefined {
  return readStore()[userId]?.refresh_token;
}

export function removeTvCredential(userId: string): void {
  const store = readStore();
  delete store[userId];
  writeJson(STORE_PATH, store);
}
