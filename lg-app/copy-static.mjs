import { existsSync, cpSync } from "node:fs";
import path from "node:path";

const appDir = import.meta.dirname;
const config = path.join(appDir, "config.js");

if (!existsSync(config))
  throw new Error(
    "Missing lg-app/config.js: copy lg-app/config.example.js and set LED_SERVER_URL",
  );

cpSync(path.join(appDir, "static"), path.join(appDir, "dist"), {
  recursive: true,
});
cpSync(config, path.join(appDir, "dist", "config.js"));
