# domo-led

Manages a 64x64 Raspberry Pi LED matrix and a TV app that show the album art of the Spotify track or podcast episode currently playing.

The repo has four main parts:

- **LED matrix animator** (`src/`): a Node server on the Pi that polls Spotify and drives the matrix with CD, podcast, idle and login animations.
- **Browser simulator** (`public/simulator.html`): runs the matrix in a browser for development on machines without a Pi.
- **TV app** (`tv-app/`): the full-screen web app with its own scene, drawn on the TV. The remote's arrows and OK drive the profile badge, the account list and the login QR.
- **Fire TV app** (`android-app/`): an Android dream (screensaver, passive: no profile badge or account list; when the Pi is unreachable it keeps the idle cat scene with a small "offline" pill instead of an error card) and a launcher app that show the TV app in a WebView full screen. The launcher app also registers the TV as a Spotify Connect device ("DomoLED TV") while it is open, and plays the phone's Spotify audio through the TV's media output (AAudio). Playback runs only in the launcher app: leaving it or starting the dream pauses, releases audio focus and drops the device, and returning resumes if it was playing. The remote's play/pause, next and previous keys control playback. Build with `pnpm android:build`; `pnpm android:rebuild` also installs it over adb and sets it as the screensaver. Setup, release and rollback are in `docs/firetv.md`.
- **Spotify login**: OAuth through a QR code, with several users and an active one. The TV's account list and user switching need the shared `TV_TOKEN` (see `docs/setup.md`).
- **TV Spotify credentials**: `node scripts/tv-login.mjs` (after `pnpm build`) authorizes an account with Spotify's keymaster client id for the TV player and stores its refresh token in `data/tv-credentials.json`. Run it on the server host; see `docs/spotify.md`.

## Docs

- `docs/setup.md`: install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md`: architecture overview and module map.
- `docs/development.md`: development workflow and the pre-commit hook.
- `docs/animations.md`: what each animation shows and how it runs.
- `docs/spotify.md`: login, playback polling and user management.
- `docs/simulator.md`: the browser simulator and its views.
- `docs/firetv.md`: the Fire TV app, its screensaver setup, release and rollback.
- `docs/agents.md`: the GitHub issue and review agents.
- `docs/review-app.md`: the GitHub App used by the review workflow.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues): known bugs and deferred work.
