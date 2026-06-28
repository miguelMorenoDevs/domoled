export type GrantTypes = "authorization_code" | "refresh_token";

export interface GetUserTokenOptions<T extends GrantTypes> {
  grant_type: T;
  token: string;
}

export interface UserTokens {
  access_token: string;
  refresh_token: string;
}

// TODO: Define Spotify API Response
