export default class SpotifyClient {
  private readonly auth_url: string;
  private readonly api_url: string;
  private readonly client_id: string;
  private readonly client_secret: string;
  private access_token: string | undefined;

  constructor() {
    this.auth_url = "https://accounts.spotify.com/api";
    this.api_url = "https://api.spotify.com/v1";
    this.client_id = process.env["SPOTIFY_CLIENT_ID"]!;
    this.client_secret = process.env["SPOTIFY_CLIENT_SECRET"]!;
  }

  private async auth() {
    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    body.append("client_id", this.client_id);
    body.append("client_secret", this.client_secret);

    const res = await fetch(this.auth_url + "/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok || res.status !== 200) {
      console.log({ res });
      throw Error("Something went wrong getting Spotify access token");
    }

    const { access_token } = (await res.json()) as {
      access_token: string;
    };

    this.access_token = access_token;
  }

  async fetch<T>(path: string) {
    if (!this.access_token) await this.auth();

    const res = await fetch(this.api_url + path, {
      headers: {
        Authorization: "Bearer " + this.access_token,
      },
    });

    console.log({ res });

    if (res.status === 401) {
      this.access_token = undefined;
      this.fetch(path);
    }

    return (await res.json()) as T;
  }
}
