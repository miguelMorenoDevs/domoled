# domo-led

Manages a 64x64 Raspberry Pi LED matrix and an LG webOS TV app that show the album art of the Spotify track or podcast episode currently playing.

The repo has four main parts:

- **LED matrix animator** (`src/`): a Node server on the Pi that polls Spotify and drives the matrix with CD, podcast, idle and login animations.
- **Browser simulator** (`public/simulator.html`): runs the matrix in a browser for development on machines without a Pi.
- **LG TV app** (`lg-app/`): a webOS app that draws the same states full screen on an LG TV, with its own scene.
- **Fire TV app** (`android-app/`): an Android dream (screensaver, passive: no profile badge or account list) and a launcher app that show the LG TV app in a WebView full screen. Build with `pnpm android:build`; `pnpm android:rebuild` also installs it over adb and sets it as the screensaver.
- **Spotify login**: OAuth through a QR code, with several users and an active one.

## Docs

- `docs/setup.md`: install, env vars, commands, simulator, OAuth setup.
- `docs/codebase.md`: architecture overview and module map.
- `docs/development.md`: development workflow and the pre-commit hook.
- `docs/animations.md`: what each animation shows and how it runs.
- `docs/spotify.md`: login, playback polling and user management.
- `docs/simulator.md`: the browser simulator and its views.
- `docs/tv.md`: the LG TV app.
- `docs/agents.md`: the GitHub issue and review agents.
- `docs/review-app.md`: the GitHub App used by the review workflow.
- [GitHub Issues](https://github.com/miguelMorenoDevs/domoled/issues): known bugs and deferred work.
