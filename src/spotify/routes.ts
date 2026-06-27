import { Router } from "express";
import type { Request, Response } from "express";
import qrcode from "qrcode-terminal";
import SpotifyClient from "./client.js";
import { getLocalIP } from "../utils/network.js";

const router: Router = Router();

router.post("/login", (_req: Request, res: Response) => {
  const state = getLocalIP()! + ":3000";
  console.log({ state });
  const scope = "user-read-currently-playing";

  const params = new URLSearchParams();
  params.append("response_type", "code");
  params.append("client_id", process.env["SPOTIFY_CLIENT_ID"]!);
  params.append("scope", scope);
  params.append("state", state);
  params.append("redirect_uri", "https://miguelmorenodevs.github.io/domoled");

  const url = "https://accounts.spotify.com/authorize?" + params;

  if (qrcode) {
    qrcode.generate(url, { small: true });
  }

  res.json({ url });
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) throw Error("No code arrived");

    if (typeof code !== "string") throw Error("code is not string");

    await SpotifyClient.auth({
      grant_type: "authorization_code",
      token: code,
    });

    const data: any = await SpotifyClient.fetch("/me/player/currently-playing");

    console.log(`User is ${!data?.is_playing ? "not " : ""}playing music.`);
    if (data?.is_playing) {
      console.log("Song title: " + data.item.name);
    }

    res.send(`
      <script>
        // Workaround for manually opened tabs
        window.open('','_parent','');
        window.close();
      </script>
    `);
  } catch (error) {
    console.error(error);
    res.status(400).send("Something went wrong.");
  }
});

export default router;
