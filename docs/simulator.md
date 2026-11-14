# Simulator and ports

On win32/darwin there is no LED matrix, so the animator mocks it and streams each frame to a browser.

## Ports

- **3000**: Express. Serves the Spotify routes, the `public/` pages and `GET /led/state` (Server-Sent Events, used by the [LG TV app](tv.md)).
- **8080**: WebSocket frame stream, started on win32/darwin only.

## Simulator

Open `simulator.html` directly in a browser (double-click or `file://`). It connects to `ws://localhost:8080`.

It is not served by Express: `public/` only holds the pages the phone and the Spotify callback open (`public/connect.html`, `public/success.html`).

On win32/darwin, boot logs the `simulator.html` file URL instead of showing the login QR on the matrix. The simulator shows nothing until you log in, and `DELETE /spotify/users/active` shows the login QR in it.
