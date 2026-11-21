# Fire TV setup

`android-app/` is an Android app for the Fire TV Stick. It runs the TV app's bundle (`tv-app/`) inside a WebView, in two hosts:

- **The dream** (`LedDreamService`) is the screensaver. It loads `index.html?passive=1`: passive, so there is no profile badge, account list or pointer UI. Any remote key dismisses it.
- **The app** (`LedActivity`, launcher icon) loads `index.html`: interactive, so you can switch accounts, add a user with the login QR, and read a connection error. The remote's arrows and OK drive it.

The Fire TV runs nothing on the Pi. It reads `GET /led/state` and `GET /spotify/status` from the server at `LED_SERVER_URL`. This guide covers the Fire TV only.

## Requirements

- Fire TV Stick on the same LAN as the Pi running the server (`pnpm dev` or the compiled server).
- ADB debugging enabled on the stick (Settings, My Fire TV, Developer options). Note the stick's address; the scripts read it from `TV_HOST`.
- JDK 17 and the Android SDK, with `ANDROID_HOME` set and `adb` on `PATH`.
- `pnpm install` run once at the repo root.
- `tv-app/config.js`, copied from `tv-app/config.example.js`, with `LED_SERVER_URL` set to `http://<pi-address>:3000` and `TV_TOKEN` set to the server's `TV_TOKEN`. The build bakes both into the bundle, so changing the server address or the token means rebuilding. The file is gitignored; do not commit it.

## Build

```sh
pnpm android:build    # tv:build, copy tv-app/dist into the app assets, gradlew assembleDebug
```

The debug APK lands in `android-app/app/build/outputs/apk/debug/`. `pnpm android:build:release` makes the release APK, which is signed only when `android-app/keystore.properties` exists (see Release below).

### Native library

The player is native: `android-app/native/` is a Rust workspace whose `librespot_jni` crate builds `librespot_jni.so` for the stick's 32-bit ARM. CI runs `android-app/build-native.sh`, which cross-compiles with the NDK for `armv7-linux-androideabi` and copies the library into `app/src/main/jniLibs/armeabi-v7a/` for Gradle to package. `jniLibs` is gitignored: a local build without Rust still works, but warns that the APK ships no native library.

The script needs a Rust toolchain with the `armv7-linux-androideabi` target and the Android NDK:

```sh
bash android-app/build-native.sh
```

`librespot-core` is pinned to `0.8.0`, with `vergen` / `vergen-gitcl` / `vergen-lib` at `9.0.6` / `1.0.8` / `0.1.6`, the versions in librespot's own lockfile: its build script breaks with a newer resolution. `ring` is pointed at the NDK compiler through forwarder scripts the build creates, because its build looks up an alias the NDK no longer ships. librespot is MIT licensed; the notice is `android-app/native/LICENSE-librespot`.

### Spotify Connect

The app's launcher activity (not the dream) registers the TV as a Spotify Connect device while it is open. The phone lists it as **DomoLED TV**. Playback follows the server's active user: the TV fetches `GET /spotify/stream-token` with `TV_TOKEN` (the same value as `tv-app/config.js`), logs the native session in with that access token, and re-checks the server every 10 s (or sooner, before `expiresAt`). The session follows the active user: switching accounts on the TV moves the device to that account within about 10 s. The TV stores no refresh token and does not log the access token.

The session plays through the AAudio sink (`native/jni/src/sink.rs`): the phone's track plays on the TV's media output. The stream is opened when playback starts and closed on pause, stop or switching back to the phone, so a paused TV holds no audio device. It is always 44.1 kHz stereo float, the rate librespot decodes to, and AAudio's media usage means the TV's media volume controls the loudness. Writes block in the player thread until the device has room, never on the UI thread. Underruns (the device ran out of audio) are counted and logged once when the stream closes, not per buffer. There is no sample-rate conversion: if AAudio refuses 44.1 kHz on a device, the player pauses and the overlay stays hidden: the phone shows playback stopped, and the device rate and format are in logcat (`AaudioSink`). When the session drops, for example on lost network or a dead connection, the app fetches a fresh token and reconnects with backoff.

The app shows a small overlay at the bottom of the screen when playback is unavailable: no active user, non-Premium account, server unreachable, expired login, the server refusing the TV token, or an unexpected native error. It disappears by itself when the session is back. The overlay is separate from the scene's error card, which the server drives, so the state stream never hides it. The dream never shows it because it never starts the player.

The app reads `LED_SERVER_URL` and `TV_TOKEN` from the bundled `config.js`. A build without that file runs the scene and skips the Connect device.

### Playback, focus and the remote

Playback is app-mode only. The launcher app (`LedActivity`) starts the Connect device and the native session; the dream never does. Leaving the app or starting the dream pauses playback within a second, releases audio focus and removes the device from the phone's list. Returning reconnects without reloading the WebView and resumes only if the player was playing when it left. Resuming needs Spotify to still hold the device's paused context; if it does not, the phone shows paused and you press play.

Audio focus is held from the moment the session is up until the app leaves or the dream starts. Losing focus to another app pauses playback, and regaining it resumes only if it was playing before the loss. The app holds focus while paused too, so another app's audio is paused or ducked while the launcher app is open.

The remote's media keys control playback while the app is in front: play/pause, play, pause, next and previous. The arrows and OK still drive the WebView. The dream does not handle media keys beyond dismissing on any key.

## Install and activate as the screensaver

With `TV_HOST` set:

```sh
pnpm android:rebuild                          # build, then install and screensaver
```

Or step by step:

```sh
node android-app/deploy.mjs connect           # adb connect, when the stick is not already online
node android-app/deploy.mjs install           # adb install -r of the newest debug APK
node android-app/deploy.mjs screensaver       # sets the dream and prints each value back
```

`install` takes an APK path as an optional argument. `connect` uses port 5555 unless `TV_HOST` includes a port.

`screensaver` writes `screensaver_components`, `screensaver_default_component` and `screensaver_enabled` in the secure settings, then reads each one back and fails if the device kept the old value.

## Verify

1. Run `node android-app/deploy.mjs screensaver` and check that the three values print back as expected.
2. Force-start the dream, which needs no waiting:

   ```sh
   adb -s "$TV_HOST" shell am start -n com.android.systemui/.Somnambulator
   ```

   The scene should fill the screen with no launcher and no bars.

3. Check the state with `adb -s "$TV_HOST" shell dumpsys power | grep mWakefulness`. It reads `Dreaming` while the dream is up.
4. Let the stick sit idle (the screen-off timeout) and confirm the dream starts and not the Amazon ambient screensaver.

## Roll back to the Amazon screensaver

```sh
node android-app/deploy.mjs restore           # puts the Amazon screensaver back, resets screen_off_timeout
node android-app/deploy.mjs uninstall         # uninstalls the app, then restores
```

`restore` sets `screensaver_components` and `screensaver_default_component` back to the Amazon service and deletes the `screen_off_timeout` override, so the platform default applies again.

## Modes at a glance

|                             | Dream (screensaver)                    | App (launcher icon)                                |
| --------------------------- | -------------------------------------- | -------------------------------------------------- |
| URL                         | `index.html?passive=1`                 | `index.html`                                       |
| Input                       | Any key dismisses it                   | Arrows and OK drive the badge, account list and QR |
| Profile badge, account list | No                                     | Yes                                                |
| Offline (Pi unreachable)    | Idle scene with a small "offline" pill | Error card: "Cannot reach the LED server."         |

## Release

`.github/workflows/firetv-release.yml` is manual only. Run it from the Actions tab or with:

```sh
gh workflow run firetv-release.yml -f tag=v1.0.0 -f install=false
```

Inputs:

- `tag` (required): the release tag, created if it does not exist.
- `install` (default `false`): also install and activate the release on the stick. This runs on a self-hosted runner labelled `firetv` on the same LAN.

The build job writes the signing config from secrets, builds with `pnpm android:build:release`, verifies the signature with `apksigner`, uploads the APK as a workflow artifact and attaches it to the release.

Secrets:

- `LED_SERVER_URL`: server address baked into the bundle.
- `TV_TOKEN`: the server's `TV_TOKEN`, baked into the bundle and sent as `X-TV-Token` to the account routes. Without it the account list and user switching fail with `403`.
- `ANDROID_KEYSTORE_BASE64`: base64 of the release keystore, for example `base64 -w0 release.jks | gh secret set ANDROID_KEYSTORE_BASE64`.
- `ANDROID_STORE_PASSWORD`: the keystore and key password (the workflow uses one password for both).
- `ANDROID_KEY_ALIAS`: the key alias inside the keystore.
- `TV_HOST`: the stick's address, used only by the install job.

Create the keystore once with `keytool -genkeypair -v -keystore release.jks -alias <alias> -keyalg RSA -keysize 2048 -validity 10000`, and keep it: an app cannot be updated over an install signed with a different key.

`.github/workflows/firetv-debug.yml` builds a debug APK as an artifact without any signing secret. Debug builds are signed with a generated key, so install a new one only after uninstalling the old one (`node android-app/deploy.mjs uninstall`). The app keeps no local state, so nothing is lost.

### One-time ADB authorization for the LAN runner

The install job runs on a self-hosted runner labelled `firetv`. The runner's ADB key must be authorized on the stick once: connect from the runner with `node android-app/deploy.mjs connect`, then accept the prompt on the TV. After that, the install job works until the stick's wireless debugging port changes (it can change after a reboot; update `TV_HOST` with the new port).

## Performance

- The canvas renders at 1280x720. A 1080p canvas ran at about 21 fps on the stick, which is below target; 1280x720 holds about 30 fps with a track playing, and the CD scene is the heaviest state.
- The WebView composites the page at the display's device pixel ratio. Keep the stick's video output at 1080p: with a 4K output the WebView composites at 3840x2160 for a 1080p panel, and frames drop about one in ten.
- Multi-hour runs were not measured end to end. Short runs showed flat memory, including ten dream restarts with one WebView each.

## Troubleshooting

These are the Fire OS 8.1 behaviours found on the device (Fire OS 8.1.8, Android 11, API 30).

- **The screensaver setting is silently ignored.** The write succeeds but the value does not change. The `screensaver` command reads each value back and fails when it differs. Run `am force-stop com.amazon.ftv.screensaver`, then `screensaver` again, then test the idle transition.
- **The Amazon ambient screensaver takes precedence.** On idle the stock screensaver can still start instead of the dream. Force-stop it as above and re-check. The scripts do not change the ambient setting.
- **The idle transition never happens.** `stay_on_while_plugged_in` keeps the stick awake, so the dream never starts. Check with `adb shell settings get global stay_on_while_plugged_in`; it must be `0`. Turn off the stick's "Stay awake" option if it is not.
- **A manual test does not start the dream.** Use the force-start command in Verify; it does not wait for the screen-off timeout.
- **Install fails with a signature mismatch.** An older build was signed with another key. Run `node android-app/deploy.mjs uninstall`, then install again.
- **The scene looks scaled or blurry.** The WebView lays out at 960x540 CSS pixels and reports `devicePixelRatio` 4, even in 1080p output mode, because it uses the display's initial (4K) size for its scale factor. The canvas is scaled by CSS to that viewport and the render size is set in `tv-app/src/tv/scene.ts`. If the output is 4K, switch it to 1080p in Settings.
- **The dream shows the idle scene with an "offline" pill, or the app shows the error card.** The Pi is not reachable from the stick. Check that `LED_SERVER_URL` in the installed bundle is right and that the Pi is on the same LAN.

## Offline behaviour

When the stream from the Pi drops, the dream keeps drawing the idle scene and shows a small "offline" pill. The app replaces the scene with the error card and its message. Nothing else works without the Pi: the track art, the login QR and the account list all come from the server.

## Build layout

`tv-app/` sources, built by `pnpm tv:build`, are the bundle. `android-app/copy-assets.mjs` copies `index.html`, `app.js` and `config.js` into the APK assets at build time, and `WebViewAssetLoader` serves them at `http://appassets.androidplatform.net/assets/`. The `passive=1` query is the only difference between the dream and the app.

`android-app/native/` is the Rust workspace behind `librespot_jni.so`; `android-app/build-native.sh` builds it into `android-app/app/src/main/jniLibs/armeabi-v7a/`, which Gradle packages. The APK carries that one ABI, matching the device.
