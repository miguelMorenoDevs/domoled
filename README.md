# domo-led

Animates the album art of the Spotify track or podcast episode currently playing on a 64x64 Raspberry Pi LED matrix, with a browser simulator for development on non-Pi machines.

## Features

- Spotify OAuth login via QR code, with the code relayed from GitHub Pages to the local device, followed by a friendly HTML success page. Each login uses a random, single-use `state` nonce (10 min expiry); the callback rejects missing, unknown or expired states with `400`.
- With no active user (on boot or after `DELETE /spotify/users/active`), the matrix shows a login QR (`/connect.html` on the LAN, a landing page whose "Connect my Spotify" button goes to `/spotify/login` and then Spotify), then the idle cat after login, then the song. On win32/darwin, boot also prints the simulator URL to the console, and the simulator shows the QR the same way the matrix does.
- CD-style animation: intro slide-in, rotating album art with silver rim and center hole, floating motion, light sheen, and fade-out. When the track is replaced or the QR or idle cat takes over, the fade-out plays once before the new content appears.
- Podcast episode animation: the artwork stays on the matrix while a dark shadow rises from the bottom edge, ripples across it and sinks back. The shadow is tinted from the artwork's dominant colour, so each episode gets its own palette. It uses the same intro, loop and outro as the CD; tracks keep the CD.
- Starts at the track's current playback position, so logging in mid-song continues instead of restarting the animation.
- Polls the active user's currently playing item every 5 s, or at the track end when a track ends sooner (plus 500 ms), and follows it. If Spotify still reports the old track at that poll, it retries every 500 ms, up to 3 times: a new track loads, pausing or resuming on Spotify pauses or resumes the animation, a position drift over 2 s seeks, and nothing playing shows the idle cat. A `429` waits `Retry-After` (or doubles the interval, capped at 60 s). The poller starts on boot with an active user, after a login and when the active user is switched.
- Multi-user token store persisted to `data/users.json`, reloaded on startup, with an active-user switch (`/spotify/users`) and removal of a stored user (`DELETE /spotify/users/:email`, which shows the login QR if that user was active). The user admin routes accept only requests from the local machine (`403` otherwise); login and callback stay reachable from the LAN.
- Automatic Spotify access-token refresh with a single retry when the API returns `401`. A refresh token that Spotify rejects (`invalid_grant`) is removed from the store and the login QR is shown again.
- Spotify API failures are reported as errors, not as "nothing playing": non-2xx responses, timeouts (10 s per request) and malformed payloads make the callback return `502`, and a `429` forwards `Retry-After`.
- When a playback poll fails, the matrix shows a red X and the TV shows a red ring with an X and the reason. The next successful poll clears it and loads the track again.
- Automatic matrix mock on Windows/macOS plus a live WebSocket frame stream for `simulator.html`.
- LG webOS TV app (`lg-app/`, webOS 5+): a full-screen version of the matrix animations (CD, idle cat, login QR) with the same timing, drawn separately so the TV visuals can differ, that follows the server's `GET /led/state` event stream, and shows a failure screen when it cannot reach the server. Build, install and launch it on the TV with `pnpm lg:rebuild` (or step by step with `pnpm lg:package` and `pnpm exec ares-install`; see `docs/tv.md`).
- Clear `502` response when the Spotify album art cannot be loaded, instead of a generic `400`.
- Idle calico cat animation while authenticated with nothing playing: it jumps in from the left and lies down with its eyes closing once (intro), then sleeps; it loops by sleeping 10 s, standing up, stretching for 4 s and lying back down to sleep, until it is replaced (loop). When a track starts or the login QR is shown, it opens its eyes and jumps out to the right once (outro) before the new content appears. It returns when playback stops or ends.
- Login while nothing is playing returns a `200` message asking the user to start a track and log in again, and shows the idle cat.
- GitHub issue agent: Issues created with `ai-ready` + `auto` are implemented, reviewed and auto-merged through Actions. A maintainer comment `implement` on an open `ai-ready` issue implements it too, but the PR waits for a human to merge. PRs the agent opens get the `ai-developed` label. A maintainer comment `change: <request>` on an `ai-developed` PR makes the agent push the change to its branch, and on an open `ai-ready` issue it rewrites the issue body. Merged PRs close their linked issues even when GitHub's native auto-close misses them.
- The issue implementation and PR review agents load the ponytail skill (`.opencode/skills/ponytail/`), which keeps changes minimal and reviews focused on real problems.
- Pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) runs build, lint, format check and tests before each commit. On Windows it checks CRLF line endings (`pnpm format:check:crlf`); elsewhere it checks LF (`pnpm format:check`). Bypass with `git commit --no-verify`.

## Docs

- `docs/setup.md` — install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md` — architecture and conventions.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues) — known bugs and deferred work.
