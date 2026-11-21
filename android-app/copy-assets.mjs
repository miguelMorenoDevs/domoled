import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const appDir = import.meta.dirname;
const dist = path.join(appDir, "..", "tv-app", "dist");
const assets = path.join(appDir, "app", "src", "main", "assets");

rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });

for (const file of ["index.html", "app.js", "config.js"]) {
  const src = path.join(dist, file);
  if (!existsSync(src))
    throw new Error(`Missing ${src}: run pnpm tv:build first`);
  cpSync(src, path.join(assets, file));
}
