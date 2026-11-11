export type GrantTypes = "authorization_code" | "refresh_token";

export interface GetUserTokenOptions<T extends GrantTypes> {
  grant_type: T;
  token: string;
}

export interface UserTokens {
  access_token: string;
  refresh_token: string;
}

export interface StoredUsers {
  users: Record<string, UserTokens>;
  active_user: string | null;
}

export interface GetCurrentlyPlayedSong {
  title: string;
  image: string;
  durationMs: number;
  progressMs: number;
}
