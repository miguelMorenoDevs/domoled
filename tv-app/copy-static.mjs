import { existsSync, cpSync } from "node:fs";
import path from "node:path";

const appDir = import.meta.dirname;
const config = path.join(appDir, "config.js");

if (!existsSync(config))
  throw new Error(
    "Missing tv-app/config.js: copy tv-app/config.example.js and set LED_SERVER_URL and TV_TOKEN",
  );

cpSync(path.join(appDir, "static"), path.join(appDir, "dist"), {
  recursive: true,
});
cpSync(config, path.join(appDir, "dist", "config.js"));
