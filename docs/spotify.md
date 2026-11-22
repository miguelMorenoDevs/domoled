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

- Polls the active user's currently playing item every 2 s and follows it: a new track loads, pausing or resuming on Spotify pauses or resumes the animation, a position drift over 2 s seeks, and nothing playing shows the idle cat. The request asks for episodes (`additional_types=episode`); without it Spotify reports them as an empty item and podcasts never load.
- The poller starts on boot with an active user, after a login and when the active user is switched.
- When a track ends sooner than 2 s, the next poll runs at the track end plus 500 ms. If Spotify still reports the old track at that poll, it retries every 500 ms, up to 3 times, then goes back to the normal schedule.
- Starts at the track's current playback position, so logging in mid-song continues instead of restarting.
- A `429` waits `Retry-After` (or doubles the interval, capped at 60 s).
- Access tokens refresh automatically, with one retry when the API returns `401`. A refresh token that Spotify rejects (`invalid_grant`) is removed and the login QR is shown again.
- Spotify API failures are errors, not "nothing playing": non-2xx responses, timeouts (10 s per request) and malformed payloads make the callback return `502`. A `429` forwards `Retry-After`.

## Stream token

- The login asks for `streaming` as well as `user-read-currently-playing user-read-private`. The Fire TV's native Spotify Connect session needs it.
- `GET /spotify/stream-token` returns `{ userId, accessToken, expiresAt, clientId }` for the active user, with `expiresAt` in epoch milliseconds from Spotify's `expires_in` and `clientId` the app's client id. Each call refreshes the access token first. The refresh token is never returned, and the response is `Cache-Control: no-store`.
- It is guarded by `requireTv` like the account routes: loopback or the `X-TV-Token` header (`403` otherwise). It answers `404` when no user is active and `401` when Spotify rejects the stored login.
- A login stored before `streaming` was added is removed when Spotify refuses its refresh with `invalid_scope` (the same path as `invalid_grant`), so the login QR comes back. Log in again to get the scope.

## Status

- `GET /spotify/status` returns the active user (`activeUser`), its Spotify `displayName` and profile picture `avatarUrl`, whether a track is playing (`playing`), and its `track` title and artist. `track` is `null` when paused, idle or no user is active.
- `displayName` and `avatarUrl` are stored at login. `avatarUrl` is `null` when Spotify sent no picture or no user is active; users logged in before that field existed show `null` until their next login.
- It reads the poller's last known state and does not call Spotify.
- The landing page (`/connect.html`) reads it every 5 s and shows the connected user and the track or "Nothing playing". The route is served to the LAN, so it exposes the active user's Spotify user id to anyone on the network.
- While a user is connected, the landing page has a "Disconnect" button that calls `DELETE /spotify/users/active` and reloads the page. The route is loopback-only, so the button works only when the page is opened on the Pi itself; from another device it shows an error.

## Users

- Tokens for several users are saved to `data/users.json` (relative to the working directory, created with mode `0600`, gitignored) on login, refresh and active-user changes, and reloaded on startup. Entries are keyed by Spotify user id, because Development Mode apps no longer receive an `email` from `GET /me`.
- `GET /spotify/users` lists them as `{ id, displayName, avatarUrl }[]` (never tokens), `POST /spotify/users/active` switches the active user with a `{ "userId": "..." }` body and `DELETE /spotify/users/:userId` removes one. Removing the active user shows the login QR.
- `GET /spotify/login/qr` returns the connect link (`url`) and its QR `modules` for the TV's "Add user" screen. It is reachable from the LAN with CORS and does not change what the matrix shows.
- `GET /spotify/users` and `POST /spotify/users/active` are for the TV app only. They send `Access-Control-Allow-Origin: *` and allow the `X-TV-Token` header, and they require that header to equal the server's `TV_TOKEN` (`403` otherwise). A request from the local machine passes without it, so the simulator's TV view works. An unset `TV_TOKEN` rejects every LAN caller. The token is a shared secret compared in constant time, not a user login: anyone who has it can list accounts and switch the active one. `DELETE` routes accept only requests from the local machine (`403` otherwise). Login and callback stay reachable from the LAN.
- To hand the display to someone else, `DELETE /spotify/users/active`: the login QR comes back and the previous user stays stored. To forget that person's login too, `DELETE /spotify/users/:userId`.
- To log every user out, stop the server and delete `data/users.json`. Deleting it while the server runs does nothing: the tokens are also held in memory, and the next save recreates the file.

## TV credentials (keymaster)

- The TV player's native Spotify session needs a credential that librespot's `login5` accepts. Tokens from this project's app are rejected there, so the TV uses a separate credential minted with Spotify's keymaster client id (`65b708073fc0480ea92a077233ca87bd`, the one librespot ships), PKCE, the `streaming` scope and the redirect `http://127.0.0.1:8898/login`.
- It is a one-off per account: run `pnpm build` once, then `node scripts/tv-login.mjs` on the server host. The command prints an authorize URL; open it in a browser on that same machine and approve, because the redirect goes to the loopback address the command listens on. The command needs port 8898 free on `127.0.0.1` and gives up after 5 minutes.
- On success it resolves the account through `GET /me` and stores its refresh token in `data/tv-credentials.json` (gitignored, mode `0600`), keyed by Spotify user id. Running it again for another account adds an entry and leaves the others alone. It prints the account it stored and never prints a token.
- A failure prints the reason and exits non-zero: consent denied, an expired code, Spotify unreachable, or a store file that cannot be read (it is not overwritten).
- This is separate from the web login the scene uses: logging in through the QR does not create this credential, and the command does not change the users in `data/users.json`.
