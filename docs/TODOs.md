# TODOs / known gaps

Verified against the current code. Re-check before relying on any item.

## Bugs

- **Token refresh discards its result.** In `SpotifyClient.fetch`, a `401` triggers `await this.getUserToken(...)` then a fire-and-forget `this.fetch(path);`; the original 401 response is still parsed and returned. Return/await the recursive call.
- **Playback position ignored.** `getCurrentSong` drops Spotify's `progress_ms`, and the callback calls `cd.play()` with no argument. Mid-song playback restarts the animation at 0.
- **Nothing-playing case is silent.** `getCurrentSong` returns `undefined` when no track is playing, and the callback then returns 200 without feedback or animation.

## Missing / deferred

- `// TODO: Render successful page` in `src/spotify/routes.ts` (callback responds with a bare 200).
- Tokens are in memory only: no persistence, so a restart loses refresh tokens and all users.
- No test suite, linting or CI. `pnpm test` fails by design.
- `dist/` is stale and partial (only `app.*`) and gitignored; always rebuild instead of trusting it.
- No error handling if album art fails to load (`loadImage` rejection surfaces as a 400 from the callback).
