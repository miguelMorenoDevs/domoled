# Codebase

## Architecture

The app has four layers:

- **Spotify integration**: OAuth login, token storage, and polling of the currently playing item.
- **Animator**: turns playback state into animations. It is shared by every output target and owns the animation lifecycle, state machine and timing.
- **Outputs**: the LED matrix on the Raspberry Pi, the browser simulator, and the Fire TV app. Each target draws the animations in its own code; the Fire TV app hosts the TV app's bundle in a WebView.
- **Web server**: serves the OAuth and login pages, the user admin API, and the event stream the TV reads.

## Module map

- `src/spotify/`: Spotify OAuth, API client, playback polling, routes and types. Routes include `GET /spotify/status`, which returns the last polled playback, the active user and its profile for the landing page and the TV, and `GET /spotify/login/qr`, which returns the connect link and its QR modules for the TV's "Add user" screen.
- `src/animator/`: shared animation lifecycle, state machine, playback clock and timing.
- `src/led/`: matrix output, simulator stream, animations for the matrix, and the event stream route.
- `src/utils/`: pure helpers used across modules, including `qr.ts` (the QR module grid shared by the matrix and the login QR route).
- `test/`: automated tests, run by `pnpm test`.
- `tv-app/`: TV app (its profile badge is `src/tv/badge.ts`; clicking it opens the account list in `src/tv/user-screen.ts`, which lists `GET /spotify/users`, switches with `POST /spotify/users/active` (both send the `X-TV-Token` header, checked by `requireTv` in `src/spotify/guard.ts`), and its "Add user" button opens the login QR from `GET /spotify/login/qr` with a Back box once an account is logged in). The remote's arrows and Enter go through `keydown` on the window (`handleKey` in `animator.ts`): `focusTargets()` lists what can be selected (the badge, the QR's Back box, or the account rows, Add user and Close), the focus ring is drawn in `drawControls` (`focusRing` in `utils/canvas.ts`, the badge's ring in `badge.ts`), and Enter presses the focused box's centre through the same `press()` path as a click. `?passive=1` (the Fire TV dream) turns off the badge, the account list, the click handler and the key handler, and replaces the error card with the idle scene plus an "offline" pill (`setOffline`, drawn in `drawStageWith`) while the stream is down. It reuses the shared animator code and has its own scene and drawing. It is built separately from the server. `build-preview.mjs` bundles the same app for the simulator's "TV" view.
- `android-app/`: Fire TV app. Two hosts share one WebView builder (`app/src/main/java/com/domo/led/scene/SceneWebView.kt`), which serves the `tv-app/` bundle from `WebViewAssetLoader` at `http://appassets.androidplatform.net/assets/`: the `DreamService` (`dream/LedDreamService.kt`, loads `index.html?passive=1`) and the launcher `LedActivity` (`LedActivity.kt`, loads `index.html`, or the passive URL when the `passive` extra is set). `copy-assets.mjs` copies the built bundle into the app assets and `assemble.mjs` runs `gradlew assembleDebug`; both run through `pnpm android:build`. `deploy.mjs` drives `adb` (install, screensaver set/restore, uninstall) against the device in `TV_HOST`.
- Static pages: the landing page the OAuth callback redirects to, and the browser simulator.
