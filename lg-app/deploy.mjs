import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const keyName = "tv_webos";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} secret`);
  return value;
}

// Call the CLI entry points directly so the deploy does not depend on the shell's pnpm shims.
function ares(bin, args, stdio = "inherit") {
  const entry = path.resolve("node_modules/@webos-tools/cli/bin", `${bin}.js`);
  execFileSync(process.execPath, [entry, ...args], { stdio });
}

function writeConfig() {
  const url = required("LED_SERVER_URL");
  writeFileSync("lg-app/config.js", `var LED_SERVER_URL = "${url}";\n`);
}

function deploy() {
  const host = required("TV_HOST");
  // The Dev Mode key is encrypted with the TV passphrase; the CLI must store it to decrypt the key.
  const passphrase = required("TV_PASSPHRASE");
  // The CLI reads the key from the same HOME/USERPROFILE path, so resolve it the same way.
  const keyPath = path.resolve(
    process.env.HOME || process.env.USERPROFILE,
    ".ssh",
    keyName,
  );
  mkdirSync(path.dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, `${required("TV_KEY").replace(/\r/g, "").trim()}\n`);
  chmodSync(keyPath, 0o600);

  try {
    ares("ares-setup-device", ["-r", "ci"], "ignore");
  } catch {
    // No previous "ci" device: the add below is the first one.
  }
  ares("ares-setup-device", [
    "-a",
    "ci",
    "-i",
    `host=${host}`,
    "-i",
    "port=9922",
    "-i",
    "username=prisoner",
    "-i",
    `privatekey=${keyName}`,
    "-i",
    `passphrase=${passphrase}`,
  ]);

  const outDir = "lg-app/out";
  const ipk = readdirSync(outDir).find((file) => file.endsWith(".ipk"));
  if (!ipk) throw new Error(`no .ipk in ${outDir}`);
  ares("ares-install", ["--device", "ci", path.join(outDir, ipk)]);
  ares("ares-launch", ["--device", "ci", "com.domo.led"]);
}

if (mode === "config") writeConfig();
else if (mode === "deploy") deploy();
else throw new Error("usage: node lg-app/deploy.mjs config|deploy");
