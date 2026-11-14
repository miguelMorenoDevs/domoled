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

## Notes

- The TV reconnects on its own when the server restarts.
- If the TV cannot reach the server within 3 seconds, or the connection drops, it shows the failure screen ("Cannot reach the LED server."). The next state from the server replaces it.
- Changing the animation visuals means editing `lg-app/src/lg/animations/`; shared timing lives in `src/animator/`.
