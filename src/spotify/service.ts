import SpotifyClient from "./client.js";

export class SpotifyService {
  private readonly client: SpotifyClient;

  constructor() {
    this.client = new SpotifyClient();
  }
  async getCurrentSong() {
    const song = await this.client.fetch("/me/player/currently-playing");

    console.log({ song });
  }
}
