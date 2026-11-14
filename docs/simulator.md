# Simulator and ports

On win32/darwin there is no LED matrix, so the animator mocks it and streams each frame to a browser.

## Ports

- **3000**: Express. Serves the Spotify routes, the `public/` pages and `GET /led/state` (Server-Sent Events, used by the [LG TV app](tv.md)).
- **8080**: WebSocket frame stream, started on win32/darwin only.

## Simulator

Open `simulator.html` directly in a browser (double-click or `file://`). It connects to `ws://localhost:8080`.

The dropdown in the top-left switches between two views:

- **LED matrix**: the frames streamed from the server, as above.
- **LG TV**: the [LG TV app](tv.md) running in the browser. It reads `GET /led/state` from `http://localhost:3000` and draws the same animations, so the TV visuals can be checked without a TV. The view fills the browser window.

Build the LG TV view's bundle once, and again after any change to `lg-app/src/`:

```sh
pnpm lg:preview   # writes lg-app/preview/app.js (gitignored)
```

The preview needs no `lg-app/config.js`: it always points at `localhost:3000`, so the server must run on the same machine as the browser. The bundle loads the first time you pick "LG TV", and an alert tells you to run `pnpm lg:preview` if it is missing.

It is not served by Express: `public/` only holds the pages the phone and the Spotify callback open (`public/connect.html`, `public/success.html`).

On win32/darwin, boot also logs the `simulator.html` file URL. The simulator shows the login QR the same way the matrix does, and `DELETE /spotify/users/active` shows it again.
