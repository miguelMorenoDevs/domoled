// One-off: authorize a Spotify account for the TV player with Spotify's keymaster client id (the one librespot uses).
// Run pnpm build first; run it on the server host, because the redirect goes to the loopback address.
// `node scripts/tv-login.mjs <spotify-user-id>` finishes a login whose profile lookup failed.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  getPendingTvCredential,
  removePendingTvCredential,
  savePendingTvCredential,
  saveTvCredential,
} from "../dist/spotify/tv-credentials.js";

const CLIENT_ID = "65b708073fc0480ea92a077233ca87bd";
const REDIRECT_URI = "http://127.0.0.1:8898/login";
const SCOPE = "streaming";
const REDIRECT_TIMEOUT_MS = 5 * 60_000;
const PROFILE_ATTEMPTS = 4;
const MAX_RETRY_AFTER_S = 60;

class LoginError extends Error {}

function base64url(buffer) {
  return buffer.toString("base64url");
}

async function fetchSpotify(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new LoginError(`Could not reach Spotify (${error.message}).`);
  }
}

function waitForRedirect(state) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/login") {
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400).end("Unknown login attempt.");
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        error
          ? "Login was not completed."
          : "Login complete. You can close this tab.",
      );
      finish();

      if (error === "access_denied")
        reject(new LoginError("Consent was denied in the browser."));
      else if (error) reject(new LoginError(`Spotify returned "${error}".`));
      else if (!code) reject(new LoginError("Spotify redirect had no code."));
      else resolve(code);
    });

    const timer = setTimeout(() => {
      finish();
      reject(
        new LoginError("Timed out after 5 minutes waiting for the browser."),
      );
    }, REDIRECT_TIMEOUT_MS);

    function finish() {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    }

    server.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new LoginError(
          `Could not listen on 127.0.0.1:8898 (${error.code ?? error.message}).`,
        ),
      );
    });
    server.listen(8898, "127.0.0.1");
  });
}

async function exchangeCode(code, verifier) {
  const res = await fetchSpotify("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok)
    throw new LoginError(
      `Spotify refused the code (${payload.error_description ?? payload.error ?? res.status}). Codes expire quickly; run the command again.`,
    );
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string"
  )
    throw new LoginError("Spotify did not return a refresh token.");

  return payload;
}

async function fetchProfile(accessToken) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchSpotify("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (res.ok) {
      const profile = await res.json().catch(() => undefined);
      if (typeof profile?.id === "string") return profile;
      throw new LoginError("Spotify /me returned no user id.");
    }

    const throttledOrDown = res.status === 429 || res.status >= 500;
    if (!throttledOrDown || attempt === PROFILE_ATTEMPTS)
      throw new LoginError(`Spotify /me failed with status ${res.status}.`);

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitS =
      retryAfter > 0
        ? Math.min(retryAfter, MAX_RETRY_AFTER_S)
        : Math.min(2 ** attempt, MAX_RETRY_AFTER_S);
    console.log(
      `Spotify /me returned ${res.status}; retrying in ${waitS}s (attempt ${attempt + 1} of ${PROFILE_ATTEMPTS}).`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitS * 1000));
  }
}

async function finishPending(userId) {
  const refreshToken = getPendingTvCredential();
  if (!refreshToken)
    throw new LoginError(
      "No pending login to finish. Run the command without arguments to authorize an account.",
    );
  saveTvCredential(userId, refreshToken);
  removePendingTvCredential();
  console.log(
    `Stored TV credential for ${userId} in data/tv-credentials.json.`,
  );
}

async function main() {
  const userId = process.argv[2];
  if (userId) return finishPending(userId);

  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  }).toString();

  const redirect = waitForRedirect(state);
  console.log(
    "Open this URL in a browser on this machine and approve the login:",
  );
  console.log(authorizeUrl.toString());

  const code = await redirect;
  const tokens = await exchangeCode(code, verifier);
  // The code is single-use, so keep the token before the profile lookup can fail.
  savePendingTvCredential(tokens.refresh_token);

  let profile;
  try {
    profile = await fetchProfile(tokens.access_token);
  } catch (error) {
    throw new LoginError(
      `${error.message} The login is kept in data/tv-credentials.pending.json. Run "node scripts/tv-login.mjs <spotify-user-id>" to finish it without approving again.`,
    );
  }
  saveTvCredential(profile.id, tokens.refresh_token);
  removePendingTvCredential();

  console.log(
    `Stored TV credential for ${profile.display_name ?? profile.id} (${profile.id}) in data/tv-credentials.json.`,
  );
}

main().catch((error) => {
  console.error(`TV login failed: ${error.message}`);
  process.exitCode = 1;
});
