export class UserNotLoggedError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super("User is not logged in");
    this.name = "UserNotLoggedError";
    this.userId = userId;
  }
}

export class SpotifyResponseError extends Error {
  readonly path: string;

  constructor(path: string) {
    super("Unexpected response shape from Spotify");
    this.name = "SpotifyResponseError";
    this.path = path;
  }
}

/** Spotify answered with a non-2xx status. */
export class SpotifyApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    path: string,
    status: number,
    retryAfterSeconds: number | undefined,
  ) {
    super(`Spotify ${path} failed with status ${status}`);
    this.name = "SpotifyApiError";
    this.status = status;
    this.path = path;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Spotify did not answer in time, or the connection or body read failed. */
export class SpotifyRequestError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Request to Spotify ${path} did not complete`, { cause });
    this.name = "SpotifyRequestError";
    this.path = path;
  }
}

/** Spotify rejected the stored refresh token; the user's tokens have been removed. */
export class SpotifyAuthRevokedError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super("Spotify rejected the stored login for this user");
    this.name = "SpotifyAuthRevokedError";
    this.userId = userId;
  }
}

/** The active user has no keymaster refresh token on the server, so the TV cannot play as them. */
export class MissingTvCredentialError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super("No TV credential is stored for this account");
    this.name = "MissingTvCredentialError";
    this.userId = userId;
  }
}

/** Spotify rejected the keymaster refresh token; it has been removed from the TV credential store. */
export class TvCredentialRevokedError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super("Spotify rejected the stored TV credential for this account");
    this.name = "TvCredentialRevokedError";
    this.userId = userId;
  }
}
