# domo-led

Animates the album art of the Spotify track currently playing on a 64x64 Raspberry Pi LED matrix, with a browser simulator for development on non-Pi machines.

## Features

- Spotify OAuth login via QR code, with the code relayed from GitHub Pages to the local device, followed by a friendly HTML success page.
- CD-style animation: intro slide-in, rotating album art with silver rim and center hole, floating motion, light sheen, and fade-out.
- Starts at the track's current playback position, so logging in mid-song continues instead of restarting the animation.
- Multi-user token store persisted to `data/users.json`, reloaded on startup, with an active-user switch (`/spotify/users`).
- Automatic Spotify access-token refresh with a single retry when the API returns `401`.
- Automatic matrix mock on Windows/macOS plus a live WebSocket frame stream for `simulator.html`.
- Clear `502` response when the Spotify album art cannot be loaded, instead of a generic `400`.
- Idle calico cat animation while authenticated with nothing playing: it jumps to the center, lies down, licks its leg and repeats every 5-10 s. It replaces the CD animation when a track plays and returns when playback stops or ends.
- Login while nothing is playing returns a `200` message asking the user to start a track and log in again, and shows the idle cat.
- GitHub issue agent: `ai-ready` + `auto` issues are implemented, reviewed and auto-merged through Actions. A maintainer comment `implement` on an open `ai-ready` issue implements it too, but the PR waits for a human to merge. Merged PRs close their linked issues even when GitHub's native auto-close misses them.

## Docs

- `docs/setup.md` — install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md` — architecture and conventions.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues) — known bugs and deferred work.
