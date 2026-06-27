import { SpotifyService } from "./spotify/service.js";

const spotifyService = new SpotifyService();

await spotifyService.getCurrentSong();
