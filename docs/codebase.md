# Codebase

## Shape

```
src/
  app.ts                  Express bootstrap, port 3000, static "public"
  spotify/
    routes.ts             HTTP routes, OAuth callback, QR code
    client.ts             Spotify OAuth + API client (singleton, in-memory tokens)
    types/api.ts          App-facing types (tokens, current song)
    types/service.ts      Spotify API response shapes
  led/
    animator.ts           Canvas rendering, matrix output, WS simulator stream (singleton `cdAnimator`)
    types.ts              AnimatorConfig, TrackData, matrix dimensions
  utils/network.ts        getLocalIP() for the OAuth state round-trip
simulator.html            Standalone browser view of the 8080 frame stream
index.html                GitHub Pages OAuth relay
public/success.html       Friendly page rendered after a successful OAuth callback
```

## Execution flow

1. `src/app.ts` mounts `spotifyRouter` at `/spotify` and listens on 3000.
2. `POST /spotify/login` builds the Spotify authorize URL (`state` = `<localIP>:3000`), prints a QR code, returns the URL.
3. Spotify redirects to the GitHub Pages `index.html`, which forwards to `GET /spotify/callback?code=...` on the local machine.
4. The callback exchanges the code for tokens, fetches the current song, loads the album art into the shared `cdAnimator`, calls `play()`, and renders `public/success.html`.
5. Each frame is drawn with `@napi-rs/canvas` (CD disc, rotating album art, center hole, sheen), pushed to the matrix, then sent as a data URL over WebSocket on non-Pi platforms.

## Routes

- `POST /spotify/login`
- `GET /spotify/callback`
- `GET /spotify/users`
- `POST /spotify/users/active`
- `DELETE /spotify/users/active`

## Conventions and gotchas

- ESM project (`"type": "module"`, `module: nodenext`): relative imports must end in `.js` even from `.ts` files.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- Strict TS extras: `noUncheckedIndexedAccess` (indexed reads are possibly undefined; the code uses `!`), `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` (hence `process.env["X"]`), plus `noUnusedLocals`/`noUnusedParameters`.
- `src/led/animator.ts` mocks the matrix on win32/darwin and loads `rpi-led-matrix` through `eval("require")` on Linux so bundlers skip the native module. Keep this pattern; do not turn it into a normal import.
- `src/spotify/client.ts` exports a singleton instance. User tokens live in a `Map<email, UserTokens>`; "temp" is used until `/me` resolves the email.
- Spotify `401` handling lives in `SpotifyClient.fetch`: it refreshes the user token and retries the request once with the new token.
- `TrackData` only carries `imageUrl` and `durationMs`; playback position is not propagated yet (tracked in GitHub issues).
- `CdAnimator.setTrack` clears the previous art/duration and throws `AlbumArtLoadError` when `loadImage` rejects; `GET /spotify/callback` maps that to a `502` retry message while other callback failures stay `400`.
