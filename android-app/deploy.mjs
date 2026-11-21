import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const appDir = import.meta.dirname;
const mode = process.argv[2];
const arg = process.argv[3];
const packageName = "com.domo.led";
const dreamComponent = "com.domo.led/.dream.LedDreamService";
const stockScreensaver =
  "com.amazon.ftv.screensaver/.app.services.ScreensaverService";
const debugDir = path.join(appDir, "app", "build", "outputs", "apk", "debug");

function host() {
  const value = process.env["TV_HOST"];
  if (!value) throw new Error("missing TV_HOST (address of the Fire TV)");
  // adb addresses a network device as host:port; the default wireless debugging port is 5555.
  return value.includes(":") ? value : `${value}:5555`;
}

function adb(step, args) {
  try {
    return execFileSync("adb", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`${step} failed: adb not found on PATH`);
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    throw new Error(
      `${step} failed: adb ${args.join(" ")}${output ? `\n${output}` : ""}`,
    );
  }
}

function setting(namespace, key) {
  return adb(`read ${namespace} ${key}`, [
    "-s",
    host(),
    "shell",
    "settings",
    "get",
    namespace,
    key,
  ]).trim();
}

function put(namespace, key, value) {
  adb(`write ${namespace} ${key}`, [
    "-s",
    host(),
    "shell",
    "settings",
    "put",
    namespace,
    key,
    value,
  ]);
  const actual = setting(namespace, key);
  if (actual !== value)
    throw new Error(
      `write ${namespace} ${key} ignored: expected ${value}, device has ${actual}`,
    );
  console.log(`${namespace} ${key} = ${actual}`);
}

function devices() {
  return adb("list devices", ["devices"])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial]) => serial)
    .map(([serial, state]) => ({ serial, state }));
}

function isOnline() {
  return devices().some(
    (device) => device.serial === host() && device.state === "device",
  );
}

function connect() {
  const target = host();
  if (isOnline()) {
    console.log(`${target} already connected`);
    return;
  }
  const output = adb("connect", ["connect", target]);
  if (!/connected/.test(output) || /failed|cannot|unable/i.test(output))
    throw new Error(
      `connect failed: ${target} is not reachable\n${output.trim()}`,
    );
  if (!isOnline())
    throw new Error(`connect failed: ${target} is listed but not online`);
  console.log(`${target} connected`);
}

function install(apkArg) {
  connect();
  const apk = apkArg ? path.resolve(apkArg) : newestDebugApk();
  try {
    statSync(apk);
  } catch {
    throw new Error(`install failed: APK not found at ${apk}`);
  }
  adb("install", ["-s", host(), "install", "-r", apk]);
  console.log(`installed ${apk}`);
}

function newestDebugApk() {
  if (!existsSync(debugDir))
    throw new Error(
      `install failed: no debug build in ${debugDir}, run pnpm android:build first`,
    );
  const apks = readdirSync(debugDir)
    .filter((file) => file.endsWith(".apk"))
    .map((file) => path.join(debugDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!apks[0])
    throw new Error(
      `install failed: no debug APK in ${debugDir}, run pnpm android:build first`,
    );
  return apks[0];
}

function screensaver() {
  connect();
  put("secure", "screensaver_components", dreamComponent);
  put("secure", "screensaver_default_component", dreamComponent);
  put("secure", "screensaver_enabled", "1");
}

function restore() {
  connect();
  put("secure", "screensaver_components", stockScreensaver);
  put("secure", "screensaver_default_component", stockScreensaver);
  // Deleting the key restores the platform default screen-off timeout.
  adb("reset screen_off_timeout", [
    "-s",
    host(),
    "shell",
    "settings",
    "delete",
    "system",
    "screen_off_timeout",
  ]);
  console.log("screen_off_timeout reset to default");
}

function uninstall() {
  connect();
  adb("uninstall", ["-s", host(), "uninstall", packageName]);
  console.log(`uninstalled ${packageName}`);
  restore();
}

const modes = {
  connect: () => connect(),
  install: () => install(arg),
  screensaver,
  restore,
  uninstall,
};
try {
  const run = modes[mode];
  if (!run)
    throw new Error(
      "usage: node android-app/deploy.mjs connect|install [apk]|screensaver|restore|uninstall",
    );
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
