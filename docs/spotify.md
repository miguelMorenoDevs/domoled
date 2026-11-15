# Spotify

## OAuth setup

- The redirect URI is hardcoded to `https://miguelmorenodevs.github.io/domoled`. It must match the Spotify app dashboard.
- That GitHub Pages URL serves `index.html`, which forwards `code` + `state` to `http://<state>/spotify/callback`. `state` is the machine's local IP from `src/utils/network.ts`.
- The redirect URI appears in both `src/spotify/client.ts` and `src/spotify/routes.ts`. Changing it means updating both files and the Spotify dashboard.

## Login

- `POST /spotify/login` returns the authorize URL and prints a QR code to the terminal. Scan it with a phone on the same LAN and approve.
- With no active user (at boot, or after `DELETE /spotify/users/active`), the matrix shows a login QR. It points to `http://<localIP>:3000/connect.html`, a landing page whose "Connect my Spotify" button goes to `/spotify/login`.
- Each login uses a random, single-use `state` nonce (10 min expiry). The callback rejects missing, unknown or expired states with `400`.
- The callback makes the logged-in user active (replacing any other connected user), starts the poller and redirects to the landing page (`/connect.html`). The poller then loads the track, or shows the idle cat when nothing is playing.

## Playback

- Polls the active user's currently playing item every 5 s and follows it: a new track loads, pausing or resuming on Spotify pauses or resumes the animation, a position drift over 2 s seeks, and nothing playing shows the idle cat.
- Starts at the track's current playback position, so logging in mid-song continues instead of restarting.
- A `429` waits `Retry-After` (or doubles the interval, capped at 60 s).
- Access tokens refresh automatically, with one retry when the API returns `401`. A refresh token that Spotify rejects (`invalid_grant`) is removed and the login QR is shown again.
- Spotify API failures are errors, not "nothing playing": non-2xx responses, timeouts (10 s per request) and malformed payloads make the callback return `502`. A `429` forwards `Retry-After`.

## Users

- Tokens for several users are saved to `data/users.json` (relative to the working directory, created with mode `0600`, gitignored) on login, refresh and active-user changes, and reloaded on startup. Entries are keyed by Spotify user id, because Development Mode apps no longer receive an `email` from `GET /me`.
- `GET /spotify/users` lists them, `POST /spotify/users/active` switches the active user with a `{ "userId": "..." }` body and `DELETE /spotify/users/:userId` removes one. Removing the active user shows the login QR.
- The user admin routes accept only requests from the local machine (`403` otherwise). Login and callback stay reachable from the LAN.
- To hand the display to someone else, `DELETE /spotify/users/active`: the login QR comes back and the previous user stays stored. To forget that person's login too, `DELETE /spotify/users/:userId`.
- To log every user out, stop the server and delete `data/users.json`. Deleting it while the server runs does nothing: the tokens are also held in memory, and the next save recreates the file.
