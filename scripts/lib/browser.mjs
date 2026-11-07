// Reads calendars that only exist once a browser has run the page. Home run only:
// puppeteer-core is installed by scripts/home-refresh.sh with --no-save, so the
// repo and GitHub's build stay free of dependencies.
//
// The browser says what it is. It keeps the HeadlessChrome name, adds this site's
// name, and uses no stealth plugin, proxy or CAPTCHA solver. A site that answers
// with a challenge or an error is recorded as refused and not tried again that day.

import { UA as CLIENT, sleep } from "./http.mjs";
import { parseIndieCommerceEvents, parse92nyHits, parseNewSchoolHits } from "./listings.mjs";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHALLENGE = /just a moment|attention required|security check|checkpoint|captcha|verify you are|access denied|pardon our interruption|are you a robot/i;
const IDENTITY = CLIENT.match(/\(compatible; ([^)]+)\)/)?.[1] ?? "authors.dearcrisis.com-calendar";

let browser = null;
let userAgent = null;
async function open() {
  if (browser) return browser;
  const { default: puppeteer } = await import("puppeteer-core");
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  userAgent = `${await browser.userAgent()} ${IDENTITY}`;
  return browser;
}

export async function closeBrowser() {
  if (browser) await browser.close().catch(() => {});
  browser = null;
}

async function load(page, url) {
  const res = await page.goto(url, { waitUntil: "networkidle2", timeout: 40000 });
  const title = await page.title();
  if ((res && res.status() >= 400) || CHALLENGE.test(title)) throw new Error(`refused (${res?.status() ?? "no answer"}, "${title.slice(0, 30)}")`);
}

// The soonest 10 of each list. Its page address for later results was ignored in
// testing, and repeated loads soon brought a blank page, so this asks once a day
// and leaves the rest to the footer's check-by-hand list.
async function read92ny(page, feed) {
  let main = null;
  page.on("response", async (r) => {
    if (!/algolia\.net/.test(r.url()) || r.request().method() !== "POST") return;
    const first = await r.json().then((b) => b.results?.[0]).catch(() => null);
    if (first?.hits && !main) main = first;
  });
  await load(page, feed.url);
  for (let n = 0; n < 15 && !main; n++) await sleep(1000);
  if (!main) throw new Error("no results came back");
  return parse92nyHits(main.hits);
}

async function readNewSchool(page, feed, { now }) {
  const hits = [];
  page.on("response", async (r) => {
    if (!/algolia\.net/.test(r.url()) || r.request().method() !== "POST") return;
    if (!/general public/.test(r.request().postData() ?? "")) return;
    const body = await r.json().catch(() => null);
    if (body?.hits) hits.push(...body.hits);
  });
  await load(page, feed.url);
  for (let n = 0; n < 12; n++) {
    const more = await page.evaluate(() => {
      const b = [...document.querySelectorAll("a,button")].find((e) => /^load more$/i.test((e.innerText || "").trim()));
      if (b) b.click();
      return !!b;
    });
    if (!more) break;
    await sleep(2000);
  }
  if (!hits.length) throw new Error("no results came back");
  return parseNewSchoolHits(hits, now);
}

// One page per month. Two empty months in a row means the calendar has run out.
async function readIndieCommerce(page, feed, { now }) {
  const out = [];
  let empty = 0;
  for (let m = 0; m < 13 && empty < 2; m++) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + m);
    const url = `${feed.url.replace(/\/$/, "")}/${d.toISOString().slice(0, 4)}/${d.toISOString().slice(5, 7)}`;
    await load(page, url);
    const items = parseIndieCommerceEvents(await page.content(), url);
    empty = items.length ? 0 : empty + 1;
    out.push(...items);
    await sleep(1500);
  }
  return out;
}

const READERS = { "92ny": read92ny, newschool: readNewSchool, indiecommerce: readIndieCommerce };

export async function readInBrowser(feed, context) {
  const reader = READERS[feed.reader];
  if (!reader) throw new Error(`no browser reader called "${feed.reader}"`);
  const b = await open();
  const page = await b.newPage();
  try {
    await page.setUserAgent(userAgent);
    return await reader(page, feed, context);
  } finally {
    await page.close().catch(() => {});
  }
}
