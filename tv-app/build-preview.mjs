import path from "node:path";
import { build } from "esbuild";

const appDir = import.meta.dirname;

// Browser bundle for simulator.html: the same app as the TV, pointed at the local server, so no config.js is needed.
await build({
  entryPoints: [path.join(appDir, "src", "main.ts")],
  bundle: true,
  format: "iife",
  target: "es2017",
  outfile: path.join(appDir, "preview", "app.js"),
  define: { LED_SERVER_URL: JSON.stringify("http://localhost:3000") },
});
