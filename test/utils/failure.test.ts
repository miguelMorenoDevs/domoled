import { test } from "node:test";
import assert from "node:assert/strict";
import { AlbumArtLoadError } from "../../src/led/errors.js";
import {
  SpotifyApiError,
  SpotifyAuthRevokedError,
  SpotifyRequestError,
  SpotifyResponseError,
} from "../../src/spotify/errors.js";
import { describeFailure } from "../../src/utils/failure.js";

test("failure reasons name the failed step", () => {
  assert.equal(
    describeFailure(new AlbumArtLoadError("https://x", undefined)),
    "Album art could not be loaded.",
  );
  assert.equal(
    describeFailure(new SpotifyAuthRevokedError("a@b.c")),
    "Spotify login expired. Log in again.",
  );
  assert.equal(
    describeFailure(new SpotifyApiError("/me", 500, undefined)),
    "Spotify answered with status 500.",
  );
  assert.equal(
    describeFailure(new SpotifyRequestError("/me", undefined)),
    "Could not reach Spotify.",
  );
  assert.equal(
    describeFailure(new SpotifyResponseError("/me")),
    "Spotify sent a reply this app could not read.",
  );
  assert.equal(describeFailure(new Error("boom")), "Something went wrong.");
});
