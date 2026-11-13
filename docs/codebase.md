# Codebase

## Shape

```
src/
  app.ts                  Express bootstrap, port 3000, static "public"
  spotify/
    routes.ts             HTTP routes, OAuth callback, QR code
    oauth-state.ts        In-memory OAuth `state` nonces (`createOAuthState`, single-use `consumeOAuthState`, 10 min expiry); the callback rejects anything else with `400`
    guard.ts              `requireLoopback` middleware: user admin routes accept only loopback sockets (403 otherwise)
    client.ts             Spotify OAuth + API client (singleton; tokens persisted to data/users.json); re-exports the error classes
    errors.ts             `UserNotLoggedError`, `SpotifyResponseError`, `SpotifyApiError` (non-2xx, with `status` and `retryAfterSeconds`), `SpotifyRequestError` (timeout or failed body read), `SpotifyAuthRevokedError` (`invalid_grant` on refresh)
    types/api.ts          App-facing types (tokens, current song) and runtime guards for the token store and token response
    types/service.ts      Spotify API response shapes and the `isGetCurrentSongResponse` guard for the fields the app reads (tracks use the album images, episodes their own images)
  led/
    animator.ts           Matrix output, WS simulator stream, active-animation selection, idle start/stop, login QR (singleton `cdAnimator`)
    errors.ts             `AlbumArtLoadError`
    animations/base.ts    `BaseLedAnimation` lifecycle (intro once, loop until `exit()`, outro once, `finished`; subclasses implement `draw`) and `animationPhaseAt`
    animations/cd.ts      CD animation: intro slide-in, rotating art, sheen, outro fade at track end or when exited (`CdAnimation`, `DEFAULT_CD_TIMING`)
    animations/calico.ts  Calico cat idle animation: intro jump and lie down once, sleep and stand-and-stretch loop until exit, outro jump out once (`CalicoCatAnimation`, `DEFAULT_CALICO_TIMING`)
    routes.ts             `GET /led/state` Server-Sent Events: sends the current `AnimatorState` on connect and on each change (CORS open for the TV app)
    types.ts              AnimatorConfig, AnimatorState, TrackData, matrix dimensions, LedAnimation interface, CdTimingConfig, CalicoTimingConfig, CanvasContext, animation phase and pose types
  utils/
    network.ts            getLocalIP() for the OAuth state round-trip
    math.ts               lerp()
    canvas.ts             fillEllipse(), fillTriangle() for canvas drawing
    clock.ts              `PlaybackClock`: track position that pauses, resumes and seeks (used by the animator's `pause()`, `resume()`, `seek()`)
test/                      node:test suites (spotify client, network utils), run by `pnpm test`
lg-app/                   LG webOS 5+ TV app: a browser copy of the LED animations, built separately (not part of `pnpm build`)
  tsconfig.json           ES2017 classic-script build (`outFile` dist/app.js); `files` order = concatenation order
  src/types.ts            Global types (no exports) incl. `ScreenState`, mirror of the server's `AnimatorState`; declares `LED_SERVER_URL`
  src/animations/         base.ts, cd.ts, calico.ts: copies of src/led/animations with DOM types; keep in step with the LED versions
  src/animator.ts         `TvAnimator`: same state machine as `CdAnimator` on a screen-sized canvas (64-unit drawing, scaled), incl. pause/resume/seek
  src/utils/clock.ts      Copy of `src/utils/clock.ts` (`PlaybackClock`), kept in step with it
  src/main.ts             Opens `EventSource(LED_SERVER_URL + "/led/state")` and maps each event to the animator
  static/                 index.html, appinfo.json, icons (copied into dist/)
  config.example.js       Template for config.js (gitignored; holds the server address)
  copy-static.mjs         Copies static/ and config.js into dist/ (run by `pnpm lg:build`)
  out/                    Packaged .ipk from `pnpm lg:package` (gitignored)
simulator.html            Standalone browser view of the 8080 frame stream
index.html                GitHub Pages OAuth relay
public/success.html       Friendly page rendered after a successful OAuth callback
public/connect.html       Landing page the matrix QR opens; its button goes to `/spotify/login`
```

## Execution flow

1. `src/app.ts` mounts `spotifyRouter` at `/spotify` and listens on 3000. With no active user it calls `cdAnimator.showQr()` for `http://<localIP>:3000/connect.html` (on win32/darwin it logs the `simulator.html` URL instead). The static `public/connect.html` page has a "Connect my Spotify" button that goes to `/spotify/login`.
2. `POST /spotify/login` builds the Spotify authorize URL (`state` = `<random nonce>.<localIP>:3000`, the nonce stored in memory for 10 min), prints a QR code, returns the URL. `GET /spotify/login` redirects to that same URL; the landing page button targets it.
3. Spotify redirects to the GitHub Pages `index.html`, which forwards `code` and `state` unchanged to `GET /spotify/callback` on the host named in `state`.
4. The callback first consumes `state`: a missing, unknown, expired or reused value gets `400` and no code exchange. Otherwise it exchanges the code for tokens, fetches the current song (including `progress_ms`), loads the album art into the shared `cdAnimator`, calls `play()` from that playback position, and renders `public/success.html`. When nothing is playing, it calls `cdAnimator.startIdle()` and replies `200` with a plain-text message instead.
5. Each frame: `renderFrame` clears the canvas, calls `animation.render()` on the active `LedAnimation` (the CD or the idle cat), pushes the canvas to the matrix, then sends it as a data URL over WebSocket on non-Pi platforms. When the animation reports `finished`, `renderFrame` stops it and runs the pending `afterExit` callback.
   5a. `setTrack()` stores the track and its loaded art. `play()` starts a `CdAnimation` for it from the playback position, with `startIdle()` as the callback for when it finishes. A `CdAnimation`'s outro starts at the end of the track (`scheduledExitMs`) or earlier when `exit()` is called.
6. Idle state: `startIdle()` runs a `CalicoCatAnimation`. The cat jumps in from the left and lies down once (eyes close in the second half of the settle), then loops: after sleeping for `sleepMs` (10 s after each stretch ends), it stands up, stretches and lies back down to sleep, until an exit is requested. `play()`, `showQr()` and `startIdle()` call `waitForExit()`, which calls `exit()` on the running animation: its outro (for the cat: eyes open, jump right and leave the matrix) plays once, and the pending call runs after it finishes. The latest request wins. It starts on boot when a user is active (`src/app.ts`), after a login with nothing playing, and when a track ends. `setTrack()` does not interrupt the running animation; `play()` replaces it. `DELETE /spotify/users/active` clears the active user and calls `showQr()` again.

## Routes

- `POST /spotify/login`
- `GET /spotify/login`
- `GET /spotify/callback`
- `GET /led/state` (SSE; the LG TV app's feed)
- `GET /spotify/users` (loopback only)
- `POST /spotify/users/active` (loopback only; `SpotifyClient.setActiveUser` throws `UserNotLoggedError` for an unknown email; the route maps it to `403` and any other error to `502`)
- `DELETE /spotify/users/active` (loopback only)
- `DELETE /spotify/users/:email` (loopback only; `SpotifyClient.removeUser` drops that user's tokens and persists the store, and clears the active user if it was that user. The route then calls `showQr()`, as `DELETE /spotify/users/active` does. Unknown emails get `404`.)

User admin routes go through `requireLoopback` (`src/spotify/guard.ts`), which checks `req.socket.remoteAddress` and answers `403` for anything that is not `127.0.0.0/8`, `::1` or their IPv4-mapped forms. Login and callback routes stay open to the LAN.

## Conventions and gotchas

- ESM project (`"type": "module"`, `module: nodenext`): relative imports must end in `.js` even from `.ts` files.
- `lg-app/` is excluded from the root `tsconfig.json` and ESLint. It is one classic script (no imports or exports; `lg-app/tsconfig.json` lists the files in order), because webOS 5 blocks module scripts from `file://`. Ship only the compiled `lg-app/dist/` through `pnpm lg:package`.
- The animator publishes every change of what is shown (`play`, `startIdle`, `showQr`) to `subscribe()` listeners; a track's `positionMs` is read live when a listener is called, so a late TV connection resumes mid-song. `lg-app/` copies the animations rather than sharing them, so a change to `src/led/animations` must be mirrored there.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- Strict TS extras: `noUncheckedIndexedAccess` (indexed reads are possibly undefined; the code uses `!`), `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` (hence `process.env["X"]`), plus `noUnusedLocals`/`noUnusedParameters`.
- `src/led/animator.ts` mocks the matrix on win32/darwin and loads `rpi-led-matrix` through `eval("require")` on Linux so bundlers skip the native module. Keep this pattern; do not turn it into a normal import.
- Types live in a types module, never in a logic file: LED types in `src/led/types.ts`, Spotify types in `src/spotify/types/`. Animation, client and route files import them with `import type`. Error classes live in the feature's `errors.ts`, and pure helpers in `src/utils/`. Do not declare a type, interface or type alias inside an animation, client or route file, even when only one module uses it.
- `tsconfig.json` only includes `src/`; `tsconfig.test.json` compiles `src/` and `test/` into `dist-test/` for `pnpm test`.
- `src/spotify/client.ts` exports a singleton instance. User tokens live in a `Map<email, UserTokens>`, loaded from `data/users.json` (resolved from the working directory) in the constructor and rewritten by `saveStore()` after login, refresh and active-user changes. A new `authorization_code` login keeps its tokens in a local value until `/me` resolves the email; only then does it enter the map and become active, so a failed login leaves the previous active user and the store unchanged.
- Spotify and store payloads are checked with hand-written guards before use. A token store that does not match `StoredUsers` is logged and ignored as a whole; a Spotify response that fails its guard throws `SpotifyResponseError`. Every Spotify request goes through `SpotifyClient.send` with a 10 s `AbortSignal.timeout`; a timeout or failed body read throws `SpotifyRequestError`, and a non-2xx status throws `SpotifyApiError` (`429` carries `Retry-After` seconds). `GET /spotify/callback` maps these three to `502`. An `invalid_grant` on refresh removes that user's tokens (`forgetUser`) and throws `SpotifyAuthRevokedError`; the callback then calls `showQr()` and replies `502`.
- Spotify `401` handling lives in `SpotifyClient.fetch`: it refreshes the user token and retries the request once with the new token.
- `TrackData` carries `imageUrl`, `durationMs` and `progressMs`; `CdAnimator.play()` starts from `progressMs` (Spotify `progress_ms`, `0` when null) so a mid-song track skips the intro instead of restarting at 0.
- `CdAnimator.setTrack` clears the previous art/duration/progress and throws `AlbumArtLoadError` when `loadImage` rejects; `GET /spotify/callback` maps that to a `502` retry message while other callback failures stay `400`. Nothing playing is still reported as `undefined` (a `204` or empty body), so the callback starts the idle cat only for that case, never for API errors.
- New animations extend `BaseLedAnimation` (`src/led/animations/base.ts`) and implement only `draw(frame, state)`; the base class owns the intro, loop, outro and `finished` phases and the `exit()` request. Intro/outro timing belongs to the animation (`CdTimingConfig`, `CalicoTimingConfig`), not `AnimatorConfig`.
