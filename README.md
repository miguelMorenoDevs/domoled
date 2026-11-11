# domo-led

Animates the album art of the Spotify track currently playing on a 64x64 Raspberry Pi LED matrix, with a browser simulator for development on non-Pi machines.

## Features

- Spotify OAuth login via QR code, with the code relayed from GitHub Pages to the local device, followed by a friendly HTML success page.
- With no active user (on boot or after `DELETE /spotify/users/active`), the matrix shows a login QR (`/spotify/login` on the LAN, which redirects to Spotify), then the idle cat after login, then the song. In local development (win32/darwin) boot prints the simulator URL to the console instead of showing the QR, and the simulator shows nothing until login.
- CD-style animation: intro slide-in, rotating album art with silver rim and center hole, floating motion, light sheen, and fade-out.
- Starts at the track's current playback position, so logging in mid-song continues instead of restarting the animation.
- Multi-user token store persisted to `data/users.json`, reloaded on startup, with an active-user switch (`/spotify/users`).
- Automatic Spotify access-token refresh with a single retry when the API returns `401`.
- Automatic matrix mock on Windows/macOS plus a live WebSocket frame stream for `simulator.html`.
- Clear `502` response when the Spotify album art cannot be loaded, instead of a generic `400`.
- Idle calico cat animation while authenticated with nothing playing: it jumps in from the left and lies down with its eyes closing once (intro), then sleeps; it loops by sleeping 10 s, standing up, stretching for 4 s and lying back down to sleep, until it is replaced (loop). When a track starts or the login QR is shown, it opens its eyes and jumps out to the right once (outro) before the new content appears. It returns when playback stops or ends.
- Login while nothing is playing returns a `200` message asking the user to start a track and log in again, and shows the idle cat.
- GitHub issue agent: `ai-ready` + `auto` issues are implemented, reviewed and auto-merged through Actions. A maintainer comment `implement` on an open `ai-ready` issue implements it too, but the PR waits for a human to merge. Merged PRs close their linked issues even when GitHub's native auto-close misses them.
- Pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) runs build, lint, format check and tests before each commit. On Windows it checks CRLF line endings (`pnpm format:check:crlf`); elsewhere it checks LF (`pnpm format:check`). Bypass with `git commit --no-verify`.

## Docs

- `docs/setup.md` — install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md` — architecture and conventions.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues) — known bugs and deferred work.
