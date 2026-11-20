import { execFileSync } from "node:child_process";
import path from "node:path";

const appDir = import.meta.dirname;
const win = process.platform === "win32";

// shell is needed on Windows to run gradlew.bat; POSIX runs the executable directly.
execFileSync(
  path.join(appDir, win ? "gradlew.bat" : "gradlew"),
  ["assembleDebug"],
  {
    cwd: appDir,
    stdio: "inherit",
    shell: win,
  },
);
