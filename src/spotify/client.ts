type GrantTypes = "authorization_code" | "refresh_token";

interface AuthOptions<T extends GrantTypes> {
  grant_type: T;
  token: string;
}

class SpotifyClient {
  private readonly auth_url: string;
  private readonly api_url: string;
  private readonly client_id: string;
  private readonly client_secret: string;
  private readonly redirect_uri: string;
  private access_token: string | undefined;
  private refresh_token: string | undefined;

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
  }

  async auth<T extends GrantTypes>({ grant_type, token }: AuthOptions<T>) {
    console.info("Auth started on type " + grant_type);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams();
    body.append("grant_type", grant_type);
    body.append("client_id", this.client_id);

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
        if (!this.refresh_token) throw Error("No refresh token available");
        body.append("refresh_token", this.refresh_token);
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
      refresh_token: string;
    };

    if (refresh_token) this.refresh_token = refresh_token;
    this.access_token = access_token;
  }

  async fetch<T>(path: string) {
    if (!this.access_token)
      throw Error("Cannot fetch without spotify access token");

    const res = await fetch(this.api_url + path, {
      headers: {
        Authorization: "Bearer " + this.access_token,
      },
    });

    // TODO: Check what returns on token expiry
    // if (res.status === 401) {
    //   this.fetch(path);
    // }

    if (res.status !== 204) return (await res.json()) as T;
  }
}

export default new SpotifyClient();
