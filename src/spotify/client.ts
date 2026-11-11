import type {
  GetCurrentlyPlayedSong,
  GetUserTokenOptions,
  GrantTypes,
  UserTokens,
} from "./types/api.js";
import type { GetCurrentSongResponse } from "./types/service.js";

class SpotifyClient {
  private readonly auth_url: string;
  private readonly api_url: string;
  private readonly client_id: string;
  private readonly client_secret: string;
  private readonly redirect_uri: string;
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
    this.users_map = new Map();
  }

  async getUserToken<T extends GrantTypes>({
    grant_type,
    token,
  }: GetUserTokenOptions<T>) {
    console.info("Token retrieval started on type " + grant_type);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams();
    body.append("grant_type", grant_type);
    body.append("client_id", this.client_id);

    let storedRefreshToken: string | undefined;

    switch (grant_type) {
      case "authorization_code":
        body.append("redirect_uri", this.redirect_uri);
        body.append("code", token);
        headers["Authorization"] =
          "Basic " +
          Buffer.from(this.client_id + ":" + this.client_secret).toString(
            "base64",
          );
        break;
      case "refresh_token":
        if (!this.active_user) throw Error("There is no active user");

        const userTokens = this.users_map.get(this.active_user);
        if (!userTokens || !userTokens.refresh_token)
          throw Error("No refresh token available");

        storedRefreshToken = userTokens.refresh_token;
        body.append("refresh_token", userTokens.refresh_token);
        break;
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
          grant_type +
          " flow",
      );
    }

    const { access_token, refresh_token } = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    if (grant_type === "authorization_code") this.active_user = "temp";

    this.users_map.set(this.active_user!, {
      access_token,
      refresh_token: refresh_token ?? storedRefreshToken!,
    });

    if (grant_type === "authorization_code") await this.assingTokensToEmail();
  }

  private async fetch<T extends object | string>(
    path: string,
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
      await this.getUserToken({
        grant_type: "refresh_token",
        token: userTokens.refresh_token,
      });
      return this.fetch<T>(path, false);
    }

    const contentType = res.headers.get("content-type");

    if (!contentType) {
      return;
    }

    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    } else if (contentType.includes("text/")) {
      return (await res.text()) as T;
    } else {
      throw Error("Non supported response type");
    }
  }

  async getLoggedUsers() {
    return Array.from(this.users_map.keys());
  }

  async hasActiveUser() {
    return !!this.active_user;
  }

  async setActiveUser(email: string) {
    const loggedUsers = await this.getLoggedUsers();

    if (!loggedUsers.includes(email)) throw Error("User is not logged in");

    this.active_user = email;
  }

  async clearActiveUser() {
    this.active_user = undefined;
  }

  async getCurrentSong(): Promise<GetCurrentlyPlayedSong | undefined> {
    const track = await this.fetch<GetCurrentSongResponse>(
      "/me/player/currently-playing",
    );

    if (!track || !track.item || track.item.type !== "track") return;

    const { images } = track.item.album;

    if (!images.length) return;

    const squareImages = images.filter(
      (i) => i.height && i.width && i.height === i.width,
    );

    const bestImage = squareImages
      ? squareImages.sort((a, b) => b.height! - a.height!)[0]
      : images[0];

    return {
      title: track.item.name,
      image: bestImage!.url,
      durationMs: track.item.duration_ms,
      progressMs: track.progress_ms ?? 0,
    };
  }

  private async assingTokensToEmail() {
    const data = await this.fetch<{ email: string }>("/me");

    if (!data || !data.email) throw Error("Fetching user email failed");

    const userTokens = this.users_map.get("temp");
    this.users_map.set(data.email, userTokens!);
    this.users_map.delete("temp");
    this.setActiveUser(data.email);
  }
}

export default new SpotifyClient();
