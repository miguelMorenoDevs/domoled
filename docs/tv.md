# LG TV setup

`lg-app/` is a webOS app that shows the matrix animations full screen on an LG TV. It does not run on the Pi: it reads `GET /led/state` from the server and draws it.

## Requirements

- LG webOS TV, webOS 5 or later, on the same LAN as the Pi.
- The server running on the Pi (`pnpm dev` or the compiled server).
- webOS CLI: installed as a dev dependency (`@webos-tools/cli`); run its commands with `pnpm exec`.

## 1. Enable Developer Mode on the TV

Install **Developer Mode** from the LG Content Store, turn it on, and note the passphrase. It turns itself off after about 50 days; re-enable it and reinstall the app when that happens.

## 2. Add the TV to the CLI

Add the TV with its address. The developer port is `9922` and the user is `prisoner`:

```sh
pnpm exec ares-setup-device -a tv -i "host=<tv-address>" -i "port=9922" -i "username=prisoner"
```

Fetch the SSH key from the Developer Mode app. It asks for the passphrase shown on the TV and saves the key as `tv_webos` under `~/.ssh/`:

```sh
pnpm exec ares-novacom --getkey -d tv
```

Point the device at that key. The TV rejects the passphrase alone, so installs need the key:

```sh
pnpm exec ares-setup-device -m tv -i "privatekey=tv_webos"
```

## 3. Point the app at the server

```sh
cp lg-app/config.example.js lg-app/config.js
```

Set `LED_SERVER_URL` in `lg-app/config.js` to `http://<pi-address>:3000`. The file is gitignored; do not commit it. The build fails without it.

## 4. Build, install and launch

One command packages, installs and launches the app:

```sh
pnpm lg:rebuild
```

Or run the steps separately:

```sh
pnpm lg:package                                          # builds lg-app/out/com.domo.led_1.0.0_all.ipk
pnpm exec ares-install --device tv lg-app/out/com.domo.led_1.0.0_all.ipk
pnpm exec ares-launch --device tv com.domo.led
```

`pnpm lg:package` runs `tsc -p lg-app`, bundles with esbuild, copies `lg-app/static/` and `config.js` into `lg-app/dist/`, then runs `ares-package`. Re-run it after any change to `lg-app/` or `config.js`, then `pnpm exec ares-install` again.

## Deploy on merge

Merging to `main` deploys the app automatically: `.github/workflows/lg-deploy.yml` packages it and installs and launches it on the TV when the commit touches `lg-app/`, `src/animator/`, `src/utils/`, `package.json` or `pnpm-lock.yaml`. Start it by hand with `gh workflow run lg-deploy.yml`. The run fails when the TV is off or the key has expired, so a stale TV does not go unnoticed.

The job runs on a self-hosted runner labelled `lg-tv`, because the TV only accepts installs from its own network. Add one under Settings → Actions → Runners → New self-hosted runner and label it `lg-tv`; the runner needs `git`, Node and pnpm, on Linux, macOS or Windows.

Set the repository secrets so the runner can build and pair the TV:

| Secret           | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| `LED_SERVER_URL` | `http://<pi-address>:3000`, the same value as `lg-app/config.js`           |
| `TV_HOST`        | the TV's IPv4 address, as in step 2                                        |
| `TV_KEY`         | the private key from step 2, `~/.ssh/tv_webos`                             |
| `TV_PASSPHRASE`  | the passphrase shown in the TV's Developer Mode app, used to fetch the key |

```sh
gh secret set LED_SERVER_URL --body "http://<pi-address>:3000"
gh secret set TV_HOST --body "<tv-address>"
gh secret set TV_KEY < ~/.ssh/tv_webos
gh secret set TV_PASSPHRASE --body "<developer-mode-passphrase>"
```

Each run pairs the TV under the name `ci`, so it leaves a local `tv` device alone. The key stays valid while Developer Mode is on; turn it back on when it expires.

## Preview in the browser

Without a TV, `simulator.html` has an "LG TV" view that runs the same app. Build it with `pnpm lg:preview` and see [simulator.md](simulator.md).

## Visuals

A round profile picture of the active user sits in the bottom-right corner in every state. It shows the first letter of the name when there is no picture, and the app reads `GET /spotify/status` every 5 s for it.

The Fire TV dream loads the same bundle at `index.html?passive=1`. A passive screen has no badge, no account list and no click handler, and its login QR has no Back box. It still shows the QR and every other state the server sends.

Clicking the profile badge (the magic remote pointer on the TV) opens the account list over the scene. Pick an account to make it active; Close or the badge returns to the animation. The list is drawn on the paused frame too, so it works while a track is paused.

"Add user" in that list shows the login QR on the projector screen, the same code the matrix shows (from `GET /spotify/login/qr`). A Back box returns to the list only once an account is logged in; the TV returns to the animation after the phone completes the login.

The app draws in the reference scene's 400x225 units and renders at 1080p, fitting the canvas to the screen. The meadow (sky, sun or moon, stars, clouds, hills, grass and flowers) follows the TV's local time of day and sits under every state; `lg-app/src/lg/scene.ts` owns it. The projector screen, the calico, the disc and the podcast cover are `BaseAnimation` subclasses in `lg-app/src/lg/animations/`, so they share the intro/loop/outro lifecycle and timing with the matrix. Every episode uses the cover, video shows included.

## Notes

- The TV reconnects on its own when the server restarts.
- The TV's own screensaver would dim or replace the display after a few minutes without a key press, so the app registers with the TV's power service and cancels each screensaver request while it is in front. This uses an undocumented webOS call; where a TV refuses it, the normal screensaver still applies.
- If the TV cannot reach the server within 3 seconds, or the connection drops, it shows the failure screen ("Cannot reach the LED server."). The next state from the server replaces it.
- Changing the scene or animation visuals means editing `lg-app/src/lg/scene.ts` and `lg-app/src/lg/animations/`; shared timing lives in `src/animator/`.
