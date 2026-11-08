# Setup

## Requirements

- Node.js with `pnpm` ^11.9 (enforced by `devEngines.packageManager`).
- Raspberry Pi with an RGB LED matrix (`rpi-led-matrix`) for real output. Windows/macOS use a built-in mock plus the browser simulator.

## Install

```sh
pnpm install
```

`pnpm-workspace.yaml` sets `allowBuilds`: `rpi-led-matrix: true`, `canvas: false`. Keep this in mind if a native dependency fails to build.

## Environment

Copy `.env.example` to `.env`:

```sh
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Both are required: `src/spotify/client.ts` throws at import time when either is missing, so the server will not start. `.env` is only loaded by `pnpm dev` (`tsx --env-file=.env`); a compiled `node dist/app.js` does not load it.

## Run

```sh
pnpm dev     # tsx src/app.ts with .env
pnpm build   # tsc -> dist/
```

- `tsx` is fetched on demand by `pnpx`; it is not a declared dependency.
- `pnpm test` intentionally exits 1 ("no test specified"). There is no test suite.
- No lint or formatter config exists.

## Issue agent

`.github/workflows/issue-agent.yml` runs OpenCode when an issue gets both the `ai-ready` and `auto` labels. It implements the issue with `.opencode/skills/issue/SKILL.md` and opens a PR that closes it.

- No API key secret is needed: add an `OPENCODE_CLIENT_ID` repository secret with the Console OAuth client id. The workflow exchanges its GitHub Actions OIDC token for a short-lived OpenCode token (`id-token: write`).
- The workflow installs OpenCode V2 with `npm install -g @opencode/cli` and runs `opencode-go/deepseek-v4.1-flash`; change the `--model` flag to use another provider/model.
- PRs opened with the default `GITHUB_TOKEN` do not trigger other workflows.

## Ports and simulator

- Express listens on **3000**.
- On win32/darwin the animator starts a WebSocket server on **8080** and streams frames.
- Open `simulator.html` directly in a browser (double-click or `file://`); it connects to `ws://localhost:8080`. It is not served by Express — `express.static("public")` exists but `public/` is empty.

## Spotify OAuth setup

- Redirect URI is hardcoded to `https://miguelmorenodevs.github.io/domoled`, which must match the Spotify app dashboard.
- That GitHub Pages URL serves `index.html`, which forwards `code` + `state` to `http://<state>/spotify/callback`; `state` is the machine's local IP from `src/utils/network.ts`.
- The redirect URI appears in both `src/spotify/client.ts` and `src/spotify/routes.ts`; changing it means updating both files and the Spotify dashboard.
- `POST /spotify/login` returns the authorize URL and prints a QR code to the terminal. Scan it, approve, and the callback starts the animation.
- Tokens are kept in memory only; restarting the server logs users out.
