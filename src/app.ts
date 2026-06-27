import express from "express";

import spotifyRouter from "./spotify/routes.js";

const app = express();

app.use("/spotify", spotifyRouter);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
