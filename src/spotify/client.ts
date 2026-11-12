import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  isStoredUsers,
  isTokenResponse,
  type GetCurrentlyPlayedSong,
  type GetUserTokenOptions,
  type StoredUsers,
  type UserTokens,
} from "./types/api.js";
import { isGetCurrentSongResponse } from "./types/service.js";
import { SpotifyResponseError, UserNotLoggedError } from "./errors.js";

export { SpotifyResponseError, UserNotLoggedError };

class SpotifyClient {
  private readonly auth_url: string;
  private readonly api_url: string;
  private readonly client_id: string;
  private readonly client_secret: string;
  private readonly redirect_uri: string;
  private readonly store_path: string;
  private active_user: string | undefined;
  private readonly users_map: Map<string, UserTokens>;

  constructor() {
    this.auth_url = "https://accounts.spotify.com/api";
    this.api_url = "https://api.spotify.com/v1";
    this.redirect_uri = "https://miguelmorenodevs.github.io/domoled";

    if (
      !process.env["SPOTIFY_CLIENT_ID"] ||
      !process.env["SPOTIFY_CLIENT_SECRET"]
    )
      throw Error("Cannot use Spotify client, missing env vars");

    this.client_id = process.env["SPOTIFY_CLIENT_ID"];
    this.client_secret = process.env["SPOTIFY_CLIENT_SECRET"];
    this.store_path = path.resolve("data", "users.json");
    this.users_map = new Map();
    this.loadStore();
  }

  private loadStore() {
    let raw: string;
    try {
      raw = readFileSync(this.store_path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.error(error);
      return;
    }

    try {
      const store: unknown = JSON.parse(raw);
      if (!isStoredUsers(store))
        throw new TypeError("Token store does not match the expected shape");
      for (const [email, tokens] of Object.entries(store.users))
        this.users_map.set(email, tokens);
      if (store.active_user && this.users_map.has(store.active_user))
        this.active_user = store.active_user;
    } catch (error) {
      console.error("Ignoring unreadable Spotify token store", error);
      this.users_map.clear();
    }
  }

  private saveStore() {
    const store: StoredUsers = {
      users: Object.fromEntries(this.users_map),
      active_user: this.active_user ?? null,
    };

    try {
      mkdirSync(path.dirname(this.store_path), { recursive: true });
      const tmpPath = this.store_path + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(store, null, 2), { mode: 0o600 });
      renameSync(tmpPath, this.store_path);
    } catch (error) {
      console.error("Could not persist Spotify tokens", error);
    }
  }

  async getUserToken(options: GetUserTokenOptions) {
    console.info("Token retrieval started on type " + options.grant_type);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams();
    body.append("grant_type", options.grant_type);
    body.append("client_id", this.client_id);

    let storedRefreshToken: string | undefined;

    switch (options.grant_type) {
      case "authorization_code":
        body.append("redirect_uri", this.redirect_uri);
        body.append("code", options.token);
        headers["Authorization"] =
          "Basic " +
          Buffer.from(this.client_id + ":" + this.client_secret).toString(
            "base64",
          );
        break;
      case "refresh_token": {
        if (!this.active_user) throw Error("There is no active user");

        const userTokens = this.users_map.get(this.active_user);
        if (!userTokens || !userTokens.refresh_token)
          throw Error("No refresh token available");

        storedRefreshToken = userTokens.refresh_token;
        body.append("refresh_token", userTokens.refresh_token);
        break;
      }
    }

    const res = await fetch(this.auth_url + "/token", {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok || res.status !== 200) {
      console.error({ res });
      throw Error(
        "Something went wrong getting Spotify access token in " +
          options.grant_type +
          " flow",
      );
    }

    const payload: unknown = await res.json();
    if (!isTokenResponse(payload)) throw new SpotifyResponseError("/token");
    const { access_token, refresh_token } = payload;

    // Spotify may omit refresh_token on refresh; the code grant has no stored token to fall back to.
    const nextRefreshToken = refresh_token ?? storedRefreshToken;
    if (nextRefreshToken === undefined)
      throw new SpotifyResponseError("/token");

    const tokens: UserTokens = {
      access_token,
      refresh_token: nextRefreshToken,
    };

    if (options.grant_type === "authorization_code") {
      await this.assingTokensToEmail(tokens);
    } else {
      const activeUser = this.active_user;
      if (!activeUser) throw Error("There is no active user");
      this.users_map.set(activeUser, tokens);
    }

    this.saveStore();
  }

  private async fetch<T>(
    path: string,
    isExpected: (value: unknown) => value is T,
    retryOnUnauthorized = true,
  ): Promise<T | undefined> {
    if (!this.active_user) throw Error("There is no active user");

    const userTokens = this.users_map.get(this.active_user);
    if (!userTokens || !userTokens.access_token)
      throw Error("Cannot fetch without access token");

    const res = await fetch(this.api_url + path, {
      headers: {
        Authorization: "Bearer " + userTokens.access_token,
      },
    });

    if (res.status === 401 && retryOnUnauthorized) {
      await this.getUserToken({ grant_type: "refresh_token" });
      return this.fetch<T>(path, isExpected, false);
    }

    const contentType = res.headers.get("content-type");

    if (!contentType) {
      return;
    }

    let payload: unknown;
    if (contentType.includes("application/json")) {
      payload = await res.json();
    } else if (contentType.includes("text/")) {
      payload = await res.text();
    } else {
      throw Error("Non supported response type");
    }

    if (!isExpected(payload)) throw new SpotifyResponseError(path);
    return payload;
  }

  async getLoggedUsers() {
    return Array.from(this.users_map.keys());
  }

  async hasActiveUser() {
    return !!this.active_user;
  }

  async setActiveUser(email: string) {
    const loggedUsers = await this.getLoggedUsers();

    if (!loggedUsers.includes(email)) throw new UserNotLoggedError(email);

    this.active_user = email;
    this.saveStore();
  }

  async clearActiveUser() {
    this.active_user = undefined;
    this.saveStore();
  }

  async removeUser(email: string) {
    if (!this.users_map.has(email)) throw new UserNotLoggedError(email);

    const wasActive = this.active_user === email;
    this.users_map.delete(email);
    if (wasActive) this.active_user = undefined;
    this.saveStore();

    return wasActive;
  }

  async getCurrentSong(): Promise<GetCurrentlyPlayedSong | undefined> {
    const track = await this.fetch(
      "/me/player/currently-playing",
      isGetCurrentSongResponse,
    );

    if (!track || !track.item || track.item.type !== "track") return;

    const { images } = track.item.album;

    // No art to draw: report nothing playing so the idle animation runs.
    if (!images.length) return;

    const squareImages = images.filter(
      (i) => i.height && i.width && i.height === i.width,
    );
    const candidates = squareImages.length ? squareImages : images;
    const size = (i: { width?: number | null; height?: number | null }) =>
      Math.max(i.width ?? 0, i.height ?? 0);

    const bestImage = [...candidates].sort((a, b) => size(b) - size(a))[0];
    if (!bestImage) return;

    return {
      title: track.item.name,
      image: bestImage.url,
      durationMs: track.item.duration_ms,
      progressMs: track.progress_ms ?? 0,
    };
  }

  private async assingTokensToEmail(tokens: UserTokens) {
    const res = await fetch(this.api_url + "/me", {
      headers: {
        Authorization: "Bearer " + tokens.access_token,
      },
    });

    const data = res.ok
      ? ((await res.json()) as { email?: string })
      : undefined;

    if (!data || !data.email) throw Error("Fetching user email failed");

    this.users_map.set(data.email, tokens);
    this.active_user = data.email;
  }
}

export default new SpotifyClient();
