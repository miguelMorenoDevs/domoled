# Codebase

## Architecture

The app has four layers:

- **Spotify integration**: OAuth login, token storage, and polling of the currently playing item.
- **Animator**: turns playback state into animations. It is shared by every output target and owns the animation lifecycle, state machine and timing.
- **Outputs**: the LED matrix on the Raspberry Pi, the browser simulator, and the LG TV app. Each target draws the animations in its own code.
- **Web server**: serves the OAuth and login pages, the user admin API, and the event stream the TV reads.

## Module map

- `src/spotify/`: Spotify OAuth, API client, playback polling, routes and types.
- `src/animator/`: shared animation lifecycle, state machine, playback clock and timing.
- `src/led/`: matrix output, simulator stream, animations for the matrix, and the event stream route.
- `src/utils/`: pure helpers used across modules.
- `test/`: automated tests, run by `pnpm test`.
- `lg-app/`: LG webOS TV app. It reuses the shared animator code and has its own drawing. It is built separately from the server.
- Static pages: the OAuth flow pages and the browser simulator.
