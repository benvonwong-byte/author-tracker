#!/usr/bin/env node
// Assembles dist/ for GitHub Pages: the static site, the public data files,
// the RSS feeds and calendar feeds, JSON-LD and geo tags, sitemap.xml,
// robots.txt, llms.txt, and the CNAME for authors.dearcrisis.com.
//
// INDEX=1 makes the site indexable. Without it every page ships noindex.
//
// SITE_URL is the address the site is served from. It defaults to
// https://authors.dearcrisis.com/, and every canonical link, share image and
// feed link is written against it.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const DOMAIN = "authors.dearcrisis.com";
const BASE = (process.env.SITE_URL || `https://${DOMAIN}/`).replace(/\/*$/, "/");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const data = existsSync(join(ROOT, "data/events.json")) ? read("data/events.json") : { fetchedAt: null, sources: [], events: [], pages: {} };
const authors = read("data/authors.json");
const unreadable = read("data/unreadable.json");
const events = data.events;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "data"), { recursive: true });
mkdirSync(join(DIST, "feeds"), { recursive: true });
cpSync(join(ROOT, "site"), DIST, { recursive: true });

writeFileSync(join(DIST, "data/events.json"), JSON.stringify(data));
writeFileSync(join(DIST, "data/authors.json"), JSON.stringify(authors.map(({ needsContext, ...a }) => a)));
writeFileSync(join(DIST, "data/unreadable.json"), JSON.stringify(unreadable));

// What each feed holds. New York is named authors only, so a subscriber never
// has to wonder why a meetup with no author on it arrived.
const inNyc = events.filter((e) => e.region === "nyc" && e.via !== "topic");
const everywhere = events;

// --- Words shared by the feeds ---------------------------------------------
const longDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const dayText = (d) => longDay.format(new Date(d + "T12:00:00Z"));
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const whenText = (e) => {
  const range = e.endDay ? `${dayText(e.day)} to ${dayText(e.endDay)}` : dayText(e.day);
  if (e.allDay) return e.timeText ? `${range}, ${e.timeText} local time` : range;
  return `${range}, ${clock.format(new Date(e.start))}`;
};
const placePhrase = (e) => {
  if (e.region === "nyc") return "in New York";
  if (e.region === "near") return e.place ? `near New York (${e.place})` : "near New York";
  if (e.region === "online") return "online";
  return e.place ? `in ${e.place}` : "";
};
const whereText = (e) => [e.place, e.venue && e.venue !== e.place ? e.venue : null].filter(Boolean).join(", ");
const headline = (e) => {
  const who = e.authors?.length ? e.authors.join(" and ") : null;
  const short = dayText(e.day).replace(/, \d{4}$/, "");
  return who ? `${who} ${placePhrase(e)}, ${short}: ${e.title}`.replace(/\s+/g, " ") : `${short}: ${e.title}`;
};
const TRUST = {
  site: "From the author's own site.",
  title: "The host lists them by name.",
  listing: "The listing mentions them, which may not mean they are appearing. Check before you go.",
  topic: "On the subject. No author from the list is named.",
};

// --- RSS -------------------------------------------------------------------
const xml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "");
const eventLink = (e) => `${BASE}#event=${e.id}`;
function rss(list, name, description, file) {
  // Newest discovery first: a reader wants the date it has not seen yet, and a
  // date six months off can be the news today.
  const items = list
    .slice()
    .sort((a, b) => Date.parse(b.firstSeen ?? 0) - Date.parse(a.firstSeen ?? 0) || a.day.localeCompare(b.day))
    .slice(0, 200)
    .map((e) => {
      const body = [`When: ${whenText(e)}`, whereText(e) ? `Where: ${whereText(e)}` : null, e.description, TRUST[e.match], e.url ? `Details: ${e.url}` : null].filter(Boolean);
      return [
        "    <item>",
        `      <title>${xml(headline(e))}</title>`,
        `      <link>${xml(e.url && /^https?:/.test(e.url) ? e.url : eventLink(e))}</link>`,
        `      <guid isPermaLink="false">${xml(e.id)}@${DOMAIN}</guid>`,
        `      <pubDate>${new Date(e.firstSeen ?? data.fetchedAt ?? Date.now()).toUTCString()}</pubDate>`,
        `      <description>${xml(body.map((p) => `<p>${xml(p)}</p>`).join(""))}</description>`,
        ...(e.authors ?? []).map((a) => `      <category>${xml(a)}</category>`),
        "    </item>",
      ].join("\n");
    });
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(name)}</title>`,
    `    <link>${xml(BASE)}</link>`,
    `    <description>${xml(description)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${new Date(data.fetchedAt ?? Date.now()).toUTCString()}</lastBuildDate>`,
    "    <ttl>360</ttl>",
    `    <atom:link href="${xml(BASE + file)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
  writeFileSync(join(DIST, file), out);
}
rss(inNyc, "Authors in Town: New York", "When writers on the metacrisis, the polycrisis, existential risk and systems come through New York City.", "feeds/nyc.xml");
rss(everywhere, "Authors in Town: everywhere", "Where writers on the metacrisis, the polycrisis, existential risk and systems are appearing, plus New York events on those subjects.", "feeds/all.xml");

// --- Calendar feeds --------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (day, plus = 0) => new Date(Date.parse(day + "T12:00:00Z") + plus * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}
const stamp = utc(data.fetchedAt ?? new Date().toISOString());
function ics(list, name) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dear Crisis//Authors in Town//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:America/New_York", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const e of list) {
    const end = e.end ?? new Date(Date.parse(e.start) + 3600000).toISOString();
    const summary = e.authors?.length ? `${e.authors.join(", ")}: ${e.title}` : e.title;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@${DOMAIN}`,
      `DTSTAMP:${stamp}`,
      e.allDay ? `DTSTART;VALUE=DATE:${dateOnly(e.day)}` : `DTSTART:${utc(e.start)}`,
      e.allDay ? `DTEND;VALUE=DATE:${dateOnly(e.endDay ?? e.day, 1)}` : `DTEND:${utc(end)}`,
      `SUMMARY:${esc(summary)}`,
      `LOCATION:${esc(whereText(e))}`,
      ...(e.url && /^https?:\/\//.test(e.url) ? [`URL:${e.url}`] : []),
      `DESCRIPTION:${esc([e.timeText && e.allDay ? `${e.timeText} local time.` : "", e.description ?? "", TRUST[e.match] ?? "", e.url ?? "", eventLink(e)].filter(Boolean).join("\n\n"))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
writeFileSync(join(DIST, "authors-nyc.ics"), ics(inNyc, "Authors in New York"));
writeFileSync(join(DIST, "authors-all.ics"), ics(everywhere, "Authors everywhere"));

// --- The page --------------------------------------------------------------
const version = createHash("sha1").update(readFileSync(join(ROOT, "site/app.js"))).update(readFileSync(join(ROOT, "site/style.css"))).update(String(data.fetchedAt)).digest("hex").slice(0, 10);
const indexable = process.env.INDEX === "1";
const robotsMeta = indexable ? `<meta name="robots" content="index, follow, max-image-preview:large">` : `<meta name="robots" content="noindex, follow">`;
const geoMeta = [`<meta name="geo.region" content="US-NY">`, `<meta name="geo.placename" content="New York City">`, `<meta name="geo.position" content="40.7306;-73.9866">`, `<meta name="ICBM" content="40.7306, -73.9866">`].join("\n  ");

const SITE_DESC = "When the writers on the metacrisis, the polycrisis, existential risk and systems come through New York City, read every morning from their own sites and from New York venue calendars.";
const publisher = { "@type": "Organization", "@id": "https://dearcrisis.com/#org", name: "Dear Crisis", url: "https://dearcrisis.com" };
const creator = { "@type": "Person", "@id": "https://vonwong.com/#person", name: "Benjamin Von Wong", url: "https://vonwong.com", affiliation: { "@id": publisher["@id"] } };
const website = { "@type": "WebSite", "@id": `${BASE}#website`, url: BASE, name: "Authors in Town", inLanguage: "en", description: SITE_DESC, creator: { "@id": creator["@id"] }, publisher: { "@id": publisher["@id"] } };
const webpage = {
  "@type": "WebPage", "@id": BASE, url: BASE, name: "Authors in Town", description: SITE_DESC, inLanguage: "en", isPartOf: { "@id": website["@id"] },
  primaryImageOfPage: { "@type": "ImageObject", url: `${BASE}assets/og-authors.jpg`, width: 1200, height: 630 },
  ...(data.fetchedAt ? { dateModified: data.fetchedAt } : {}),
};
const next = events.filter((e) => e.authors?.length).sort((a, b) => (a.region === "nyc" ? 0 : 1) - (b.region === "nyc" ? 0 : 1)).slice(0, 50);
const eventList = {
  "@type": "ItemList", name: "Upcoming author appearances", numberOfItems: next.length,
  itemListElement: next.map((e, i) => ({
    "@type": "ListItem", position: i + 1,
    item: {
      "@type": "Event", name: e.title, startDate: e.allDay ? e.day : e.start, url: e.url ?? eventLink(e),
      eventAttendanceMode: e.region === "online" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
      location: e.region === "online" ? { "@type": "VirtualLocation", url: e.url ?? eventLink(e) } : { "@type": "Place", name: e.place ?? "To be confirmed", address: e.place ?? "To be confirmed" },
      performer: e.authors.map((name) => ({ "@type": "Person", name })),
    },
  })),
};
const ld = `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [website, creator, publisher, webpage, eventList] }).replace(/</g, "\\u003c")}</script>`;
const fill = (html) => html.replaceAll("__VERSION__", version).replaceAll("__SITE__", BASE).replace("<!--ROBOTS-->", robotsMeta).replace("<!--GEO-->", geoMeta).replace("<!--JSONLD-->", ld);
writeFileSync(join(DIST, "index.html"), fill(readFileSync(join(DIST, "index.html"), "utf8")));

// --- Sitemap, robots.txt, llms.txt -----------------------------------------
const today = (data.fetchedAt ?? new Date().toISOString()).slice(0, 10);
writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n`);
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
writeFileSync(
  join(DIST, "llms.txt"),
  [
    "# Authors in Town",
    "",
    `> ${SITE_DESC} Made by Benjamin Von Wong of the Dear Crisis community (https://dearcrisis.com).`,
    "",
    "## Data",
    "",
    `- [feeds/nyc.xml](${BASE}feeds/nyc.xml): RSS, named authors in New York City`,
    `- [feeds/all.xml](${BASE}feeds/all.xml): RSS, every date everywhere`,
    `- [authors-nyc.ics](${BASE}authors-nyc.ics): the New York dates as a calendar`,
    `- [authors-all.ics](${BASE}authors-all.ics): every date as a calendar`,
    `- [events.json](${BASE}data/events.json): every date with its source`,
    `- [authors.json](${BASE}data/authors.json): the authors followed`,
    "",
    `## New York dates (${inNyc.length})`,
    "",
    ...inNyc.map((e) => `- ${whenText(e)}: ${line(e.authors.join(", "))}, ${line(e.title)}${whereText(e) ? ` (${line(whereText(e))})` : ""}`),
    "",
    `## Authors (${authors.length})`,
    "",
    ...authors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((a) => `- ${a.site ? `[${line(a.name)}](${a.site})` : line(a.name)}: ${line(a.what)}`),
    "",
  ].join("\n")
);

if (new URL(BASE).host === DOMAIN) writeFileSync(join(DIST, "CNAME"), DOMAIN + "\n");
writeFileSync(join(DIST, ".nojekyll"), "");
console.log(`build: dist/ ready at ${BASE} (${events.length} events, ${inNyc.length} in New York, ${authors.length} authors, version ${version}${indexable ? "" : ", noindex"})`);
