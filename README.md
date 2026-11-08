# domo-led

Animates the album art of the Spotify track currently playing on a 64x64 Raspberry Pi LED matrix, with a browser simulator for development on non-Pi machines.

## Features

- Spotify OAuth login via QR code, with the code relayed from GitHub Pages to the local device.
- CD-style animation: intro slide-in, rotating album art with silver rim and center hole, floating motion, light sheen, and fade-out.
- In-memory multi-user token store with an active-user switch (`/spotify/users`).
- Automatic Spotify access-token refresh with a single retry when the API returns `401`.
- Automatic matrix mock on Windows/macOS plus a live WebSocket frame stream for `simulator.html`.
- GitHub issue agent: `ai-ready` + `auto` issues are implemented, reviewed and auto-merged through Actions, and merged PRs close their linked issues even when GitHub's native auto-close misses them.

## Docs

- `docs/setup.md` — install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md` — architecture and conventions.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues) — known bugs and deferred work.
