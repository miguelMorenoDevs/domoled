import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const appDir = import.meta.dirname;
const win = process.platform === "win32";
const variant =
  process.argv[2] === "release" ? "assembleRelease" : "assembleDebug";

const nativeLibrary = path.join(
  appDir,
  "app",
  "src",
  "main",
  "jniLibs",
  "armeabi-v7a",
  "librespot_jni.so",
);
if (!existsSync(nativeLibrary)) {
  console.warn(
    "warning: no native library in jniLibs, the APK ships without one; CI builds it with android-app/build-native.sh",
  );
}

// shell is needed on Windows to run gradlew.bat; POSIX runs the executable directly.
execFileSync(path.join(appDir, win ? "gradlew.bat" : "gradlew"), [variant], {
  cwd: appDir,
  stdio: "inherit",
  shell: win,
});
