export class UserNotLoggedError extends Error {
  readonly email: string;

  constructor(email: string) {
    super("User is not logged in");
    this.name = "UserNotLoggedError";
    this.email = email;
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
