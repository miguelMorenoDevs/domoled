import { AlbumArtLoadError } from "../led/errors.js";
import {
  SpotifyApiError,
  SpotifyAuthRevokedError,
  SpotifyRequestError,
  SpotifyResponseError,
} from "../spotify/errors.js";

/** Short, user-facing reason shown on the failure screen. */
export function describeFailure(error: unknown): string {
  if (error instanceof AlbumArtLoadError)
    return "Album art could not be loaded.";
  if (error instanceof SpotifyAuthRevokedError)
    return "Spotify login expired. Log in again.";
  if (error instanceof SpotifyApiError)
    return `Spotify answered with status ${error.status}.`;
  if (error instanceof SpotifyRequestError) return "Could not reach Spotify.";
  if (error instanceof SpotifyResponseError)
    return "Spotify sent a reply this app could not read.";
  return "Something went wrong.";
}
