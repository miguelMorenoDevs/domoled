import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import qrcode from "qrcode-terminal";
import SpotifyClient from "./client.js";
import { UserNotLoggedError } from "./errors.js";
import { getLocalIP } from "../utils/network.js";
import { cdAnimator } from "../led/animator.js";
import { AlbumArtLoadError } from "../led/errors.js";
import { requireLoopback } from "./guard.js";

const router: Router = Router();

function spotifyAuthorizeUrl(): string {
  const state = getLocalIP()! + ":3000";
  const scope = "user-read-currently-playing user-read-email";

  const params = new URLSearchParams();
  params.append("response_type", "code");
  params.append("client_id", process.env["SPOTIFY_CLIENT_ID"]!);
  params.append("scope", scope);
  params.append("state", state);
  params.append("redirect_uri", "https://miguelmorenodevs.github.io/domoled");

  return "https://accounts.spotify.com/authorize?" + params;
}

router.post("/login", (_req: Request, res: Response) => {
  const url = spotifyAuthorizeUrl();

  if (qrcode) {
    qrcode.generate(url, { small: true });
  }

  res.json({ url });
});

// Short target for the matrix QR: the phone opens it on the LAN and gets redirected to Spotify.
router.get("/login", (_req: Request, res: Response) => {
  res.redirect(spotifyAuthorizeUrl());
});

export function loginQrUrl(): string {
  return `http://${getLocalIP()!}:3000/spotify/login`;
}

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code) throw Error("No code arrived");

    if (typeof code !== "string") throw Error("code is not string");

    await SpotifyClient.getUserToken({
      grant_type: "authorization_code",
      token: code,
    });

    const song = await SpotifyClient.getCurrentSong();
    console.log({ song });
    if (!song) {
      cdAnimator.startIdle();
      res.send(
        "Logged in, but no track is playing on Spotify right now. Start a track and log in again to animate it.",
      );
      return;
    }

    await cdAnimator.setTrack({
      imageUrl: song.image,
      durationMs: song.durationMs,
      progressMs: song.progressMs,
    });
    cdAnimator.play();
    console.info(
      "Check your animation in: " + process.cwd() + "/simulator.html",
    );

    res.sendFile(path.join(process.cwd(), "public", "success.html"));
  } catch (error) {
    console.error(error);
    if (error instanceof AlbumArtLoadError) {
      res
        .status(502)
        .send(
          "Logged in, but the album art could not be loaded from Spotify. Please try again.",
        );
      return;
    }
    res.status(400).send("Something went wrong.");
  }
});

router.get("/users", requireLoopback, async (_req: Request, res: Response) => {
  const users = await SpotifyClient.getLoggedUsers();
  res.send({
    users,
  });
});

router.post(
  "/users/active",
  requireLoopback,
  async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).send("Email is mandatory");
        return;
      }

      await SpotifyClient.setActiveUser(email);
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      if (error instanceof UserNotLoggedError) {
        res.status(403).send(error.message);
      } else {
        res.sendStatus(502);
      }
    }
  },
);

router.delete(
  "/users/active",
  requireLoopback,
  async (_req: Request, res: Response) => {
    SpotifyClient.clearActiveUser();
    cdAnimator.showQr(loginQrUrl());
    res.sendStatus(200);
  },
);

router.delete(
  "/users/:email",
  requireLoopback,
  async (req: Request, res: Response) => {
    try {
      const wasActive = await SpotifyClient.removeUser(
        String(req.params["email"]),
      );
      if (wasActive) cdAnimator.showQr(loginQrUrl());
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      if (error instanceof UserNotLoggedError) {
        res.status(404).send(error.message);
      } else {
        res.sendStatus(502);
      }
    }
  },
);

export default router;
