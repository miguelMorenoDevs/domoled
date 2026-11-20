# Codebase

## Architecture

The app has four layers:

- **Spotify integration**: OAuth login, token storage, and polling of the currently playing item.
- **Animator**: turns playback state into animations. It is shared by every output target and owns the animation lifecycle, state machine and timing.
- **Outputs**: the LED matrix on the Raspberry Pi, the browser simulator, and the LG TV app. Each target draws the animations in its own code.
- **Web server**: serves the OAuth and login pages, the user admin API, and the event stream the TV reads.

## Module map

- `src/spotify/`: Spotify OAuth, API client, playback polling, routes and types. Routes include `GET /spotify/status`, which returns the last polled playback, the active user and its profile for the landing page and the TV, and `GET /spotify/login/qr`, which returns the connect link and its QR modules for the TV's "Add user" screen.
- `src/animator/`: shared animation lifecycle, state machine, playback clock and timing.
- `src/led/`: matrix output, simulator stream, animations for the matrix, and the event stream route.
- `src/utils/`: pure helpers used across modules, including `qr.ts` (the QR module grid shared by the matrix and the login QR route).
- `test/`: automated tests, run by `pnpm test`.
- `lg-app/`: LG webOS TV app (its profile badge is `src/lg/badge.ts`; clicking it opens the account list in `src/lg/user-screen.ts`, which lists `GET /spotify/users`, switches with `POST /spotify/users/active`, and its "Add user" button opens the login QR from `GET /spotify/login/qr` with a Back box once an account is logged in). It reuses the shared animator code and has its own scene and drawing. It is built separately from the server. `build-preview.mjs` bundles the same app for the simulator's "LG TV" view.
- `android-app/`: Fire TV app. One `DreamService` (`app/src/main/java/com/domo/led/dream/LedDreamService.kt`) hosts the `lg-app/` bundle in a `WebView`, served from `WebViewAssetLoader` at `http://appassets.androidplatform.net/assets/`. `copy-assets.mjs` copies the built bundle into the app assets and `assemble.mjs` runs `gradlew assembleDebug`; both run through `pnpm android:build`.
- Static pages: the landing page the OAuth callback redirects to, and the browser simulator.
