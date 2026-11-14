export type GetUserTokenOptions =
  | { grant_type: "authorization_code"; token: string }
  | { grant_type: "refresh_token" };

export interface UserTokens {
  access_token: string;
  refresh_token: string;
}

export interface StoredUsers {
  users: Record<string, UserTokens>;
  active_user: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUserTokens(value: unknown): value is UserTokens {
  return (
    isRecord(value) &&
    typeof value["access_token"] === "string" &&
    typeof value["refresh_token"] === "string"
  );
}

export function isStoredUsers(value: unknown): value is StoredUsers {
  if (!isRecord(value)) return false;

  const users = value["users"];
  const activeUser = value["active_user"];

  return (
    isRecord(users) &&
    Object.values(users).every(isUserTokens) &&
    (activeUser === null || typeof activeUser === "string")
  );
}

export function isTokenResponse(value: unknown): value is TokenResponse {
  return (
    isRecord(value) &&
    typeof value["access_token"] === "string" &&
    (value["refresh_token"] === undefined ||
      typeof value["refresh_token"] === "string")
  );
}

export interface GetCurrentlyPlayedSong {
  id: string;
  title: string;
  artist: string;
  image: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  contentType: "track" | "episode";
}

export interface SpotifyStatusTrack {
  title: string;
  artist: string;
}

export interface SpotifyStatus {
  activeUser: string | null;
  playing: boolean;
  track: SpotifyStatusTrack | null;
}
