// Renders tools/logo/knight.html into brand/*.png with headless Chrome (no npm dependencies).
// The page draws the logo, then leaves it in the DOM as a PNG data URL; --dump-dom hands it back,
// which gives exact pixels at any size (window screenshots can't go down to 32px).
// Usage: node tools/logo/render.mjs [file.png]     (CHROME=/path/to/chrome to pick the browser)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(resolve(here, "../.."), "brand");
const page = pathToFileURL(join(here, "knight.html")).href;

const OUTPUTS = [
  { file: "knight-1024.png", size: 1024, frame: "full", bg: "transparent" },
  { file: "knight-720.webp", size: 720, frame: "full", bg: "transparent", format: "webp" }, // landing hero
  { file: "knight-mark@2x.png", size: 96, frame: "head", bg: "transparent" },
  { file: "favicon-64.png", size: 64, frame: "head", bg: "transparent" },
  { file: "favicon-32.png", size: 32, frame: "head", bg: "transparent" },
  { file: "apple-touch-icon.png", size: 180, frame: "head", bg: "tile" },
];

function findChrome() {
  const found = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].find((p) => p && existsSync(p));
  if (!found) throw new Error("Chrome not found; set CHROME=/path/to/chrome");
  return found;
}

const chrome = findChrome();
mkdirSync(outDir, { recursive: true });
const only = process.argv[2];

for (const o of OUTPUTS) {
  if (only && o.file !== only) continue;
  const profile = mkdtempSync(join(tmpdir(), "knight-logo-"));
  const url = `${page}?size=${o.size}&frame=${o.frame}&bg=${o.bg}&format=${o.format || "png"}`;
  const r = spawnSync(chrome, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--window-size=512,512", "--virtual-time-budget=30000",
    "--dump-dom", url,
  ], { encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  rmSync(profile, { recursive: true, force: true });
  const m = /data:image\/(?:png|webp);base64,([A-Za-z0-9+/=]+)/.exec(r.stdout || "");
  if (!m) {
    console.error(`FAIL ${o.file}: the page did not finish\n${r.stderr || r.error || ""}`);
    process.exitCode = 1;
    continue;
  }
  const img = Buffer.from(m[1], "base64");
  writeFileSync(join(outDir, o.file), img);
  console.log(`ok   ${o.file}  ${o.size}px  ${(img.length / 1024).toFixed(1)} KB`);
}
