import express from "express";
import { pathToFileURL } from "node:url";

import SpotifyClient from "./spotify/client.js";
import spotifyRouter, { loginQrUrl } from "./spotify/routes.js";
import { cdAnimator } from "./led/animator.js";
import ledRouter from "./led/routes.js";
import { startPlaybackPoller } from "./spotify/playback.js";

const app = express();

app.use(express.json());

app.use("/spotify", spotifyRouter);
app.use("/led", ledRouter);

app.use(express.static("public"));

app.listen(3000, async () => {
  console.log("Server running on port 3000");
  if (await SpotifyClient.hasActiveUser()) {
    cdAnimator.startIdle();
    startPlaybackPoller(SpotifyClient, cdAnimator);
  } else if (process.platform === "win32" || process.platform === "darwin")
    console.log(`Simulator: ${pathToFileURL("simulator.html").href}`);
  else cdAnimator.showQr(loginQrUrl());
});
