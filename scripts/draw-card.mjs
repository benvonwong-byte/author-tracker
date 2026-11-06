#!/usr/bin/env node
// Draws site/assets/og-authors.jpg, the 1200x630 card WhatsApp, Signal and
// iMessage show for a link, in the same layout as Sunset Events: a masthead
// panel beside a screenshot of the list. Needs Google Chrome and macOS `sips`,
// and the site running on localhost:4323. The card is committed, so CI does
// not draw it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = join(ROOT, "site/assets/og-authors.jpg");
const MAX_BYTES = 280_000;
const tmp = mkdtempSync(join(tmpdir(), "card-"));
const shot = (url, file, w, h, scale = 1) =>
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`, "--virtual-time-budget=6000", `--screenshot=${file}`, url], { stdio: "ignore", timeout: 60000 });

const panel = join(tmp, "panel.png");
shot(process.env.CARD_URL || "http://localhost:4323/", panel, 468, 630, 2);
const pigeon = pathToFileURL(join(ROOT, "site/assets/pigeon.png")).href;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Figtree:wght@600;700&family=Special+Elite&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#fbfaf5}
.card{display:grid;grid-template-columns:732px 468px;width:1200px;height:630px}
.text{padding:52px 60px 44px;display:flex;flex-direction:column;color:#1b1a17}
.top{border-top:7px solid #1b1a17;border-bottom:1.5px solid #1b1a17;padding:16px 0 13px;display:flex;justify-content:space-between;font:400 21px/1 'Special Elite',monospace;letter-spacing:.06em;text-transform:uppercase}
.top .l{color:#8a5a06}.top .r{color:#6f6a5e}
.bar{width:104px;height:7px;background:#e3a63f;border-radius:4px;margin-top:62px}
h1{font:400 98px/.98 'Caveat Brush',cursive;margin-top:20px;letter-spacing:.005em}
.under{width:420px;height:16px;margin-top:6px}
.under path{fill:none;stroke:#e3a63f;stroke-width:3;stroke-linecap:round}
.date{margin-top:22px;font:400 22px/1.45 'Special Elite',monospace;letter-spacing:.05em;text-transform:uppercase;color:#4b483f}
.foot{margin-top:auto;border-top:1.5px solid #1b1a17;padding-top:16px;display:flex;justify-content:space-between;align-items:center;font:700 19px/1 'Figtree',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#4b483f}
.foot img{height:34px}
.photo{background:#fff top center/cover no-repeat url('${pathToFileURL(panel).href}');border-left:1.5px solid #1b1a17}
</style></head><body><div class="card">
<div class="text">
 <div class="top"><span class="l">New York City</span><span class="r">Updated daily</span></div>
 <div class="bar"></div>
 <h1>Authors<br>in Town</h1>
 <svg class="under" viewBox="0 0 420 16" preserveAspectRatio="none"><path d="M3 5 C 110 2, 270 5, 417 3"/><path d="M8 12 C 120 10, 280 12, 412 10"/></svg>
 <p class="date">Metacrisis, polycrisis, existential risk<br>Who is coming through, and when</p>
 <div class="foot"><span>A Dear Crisis project</span><img src="${pigeon}" alt=""></div>
</div>
<div class="photo"></div>
</div></body></html>`;
const page = join(tmp, "card.html");
writeFileSync(page, html);
const png = join(tmp, "card.png");
shot(pathToFileURL(page).href, png, 1200, 630);
for (const quality of [86, 80, 74, 68]) {
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality), png, "--out", OUT], { stdio: "ignore" });
  if (statSync(OUT).size <= MAX_BYTES) break;
}
console.log(`draw-card: ${OUT}: ${statSync(OUT).size} bytes`);
if (statSync(OUT).size > MAX_BYTES || readFileSync(OUT).length === 0) process.exit(1);
