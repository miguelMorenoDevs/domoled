import { isRecord } from "./api.js";

export interface Device {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: "computer" | "smartphone" | "speaker";
  volume_percent: number | null;
  supports_volume: boolean;
}
export interface ExternalUrlsObject {
  [key: string]: string;
}

export interface ExternalIdsObject {
  [key: string]: string;
}

export interface RestrictionsObject {
  reason?: string;
}

export interface SimplifiedArtistObject {
  external_urls?: ExternalUrlsObject;
  href?: string;
  id?: string;
  name?: string;
  type?: "artist";
  uri?: string;
}

export interface LinkedFromObject {
  external_urls?: ExternalUrlsObject;
  href?: string;
  id?: string;
  type?: string;
  uri?: string;
}

export interface ContextObject {
  type: "artist" | "playlist" | "album" | "show" | string;
  href: string;
  external_urls: { [key: string]: string };
  uri: string;
}

export interface EpisodeObject {
  type: "episode";
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  images: ImageObject[];
}

export interface DisallowsObject {
  interrupting_playback?: boolean;
  pausing?: boolean;
  resuming?: boolean;
  seeking?: boolean;
  skipping_next?: boolean;
  skipping_prev?: boolean;
  toggling_repeat_context?: boolean;
  toggling_shuffle?: boolean;
  toggling_repeat_track?: boolean;
  transferring_playback?: boolean;
}

export interface ActionsObject {
  disallows: DisallowsObject;
}

export interface ImageObject {
  url: string;
  height: number | null;
  width: number | null;
}

// --- Main Interfaces ---

export interface AlbumObject {
  album_type: "album" | "single" | "compilation";
  total_tracks: number;
  /** @deprecated */
  available_markets: string[];
  external_urls: ExternalUrlsObject;
  href: string;
  id: string;
  images: ImageObject[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  restrictions?: RestrictionsObject;
  type: "album";
  uri: string;
  artists: SimplifiedArtistObject[];
}

export interface TrackObject {
  album: AlbumObject;
  artists: SimplifiedArtistObject[];
  /** @deprecated */
  available_markets?: string[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids?: ExternalIdsObject;
  external_urls?: ExternalUrlsObject;
  href: string;
  id: string;
  is_playable?: boolean;
  restrictions?: RestrictionsObject;
  name: string;
  track_number: number;
  type: "track";
  uri: string;
  is_local: boolean;
}

export interface GetCurrentSongResponse {
  device: Device;
  repeat_state: "off" | "track" | "context";
  shuffle_state: boolean;
  context: ContextObject | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: TrackObject | EpisodeObject | null; // TrackObject from previous step
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  actions: ActionsObject;
}

function isImageObject(value: unknown): value is ImageObject {
  return (
    isRecord(value) &&
    typeof value["url"] === "string" &&
    (value["height"] === null || typeof value["height"] === "number") &&
    (value["width"] === null || typeof value["width"] === "number")
  );
}

function isCurrentlyPlayingItem(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || typeof value["type"] !== "string") return false;
  if (value["type"] === "episode") {
    return (
      typeof value["name"] === "string" &&
      typeof value["duration_ms"] === "number" &&
      Array.isArray(value["images"]) &&
      value["images"].every(isImageObject)
    );
  }
  if (value["type"] !== "track") return true;

  const album = value["album"];

  return (
    typeof value["name"] === "string" &&
    typeof value["duration_ms"] === "number" &&
    isRecord(album) &&
    Array.isArray(album["images"]) &&
    album["images"].every(isImageObject)
  );
}

// Checks only the fields the app reads from the currently-playing response.
export function isGetCurrentSongResponse(
  value: unknown,
): value is GetCurrentSongResponse {
  return (
    isRecord(value) &&
    (value["progress_ms"] === null ||
      typeof value["progress_ms"] === "number") &&
    isCurrentlyPlayingItem(value["item"])
  );
}
