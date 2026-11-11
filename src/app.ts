import express from "express";

import SpotifyClient from "./spotify/client.js";
import spotifyRouter, { loginQrUrl } from "./spotify/routes.js";
import { cdAnimator } from "./led/animator.js";

const app = express();

app.use(express.json());

app.use("/spotify", spotifyRouter);

app.use(express.static("public"));

app.listen(3000, async () => {
  console.log("Server running on port 3000");
  if (await SpotifyClient.hasActiveUser()) cdAnimator.startIdle();
  else cdAnimator.showQr(loginQrUrl());
});
