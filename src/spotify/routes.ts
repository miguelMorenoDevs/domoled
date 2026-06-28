import { Router } from "express";
import type { Request, Response } from "express";
import qrcode from "qrcode-terminal";
import SpotifyClient from "./client.js";
import { getLocalIP } from "../utils/network.js";

const router: Router = Router();

router.post("/login", (_req: Request, res: Response) => {
  const state = getLocalIP()! + ":3000";
  const scope = "user-read-currently-playing user-read-email";

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

    await SpotifyClient.getUserToken({
      grant_type: "authorization_code",
      token: code,
    });

    // TODO: Render successful page
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.status(400).send("Something went wrong.");
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  const users = await SpotifyClient.getLoggedUsers();
  res.send({
    users,
  });
});

// @ts-expect-error
router.post("/users/active", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).send("Email is mandatory");

    await SpotifyClient.setActiveUser(email);
    res.sendStatus(200);
  } catch (error: any) {
    console.error(error);
    if ("message" in error && error.message.includes("not logged")) {
      res.status(403).send(error.message);
    } else {
      res.sendStatus(502);
    }
  }
});

router.delete("/users/active", async (_req: Request, res: Response) => {
  SpotifyClient.clearActiveUser();
  res.sendStatus(200);
});

export default router;
