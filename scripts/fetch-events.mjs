#!/usr/bin/env node
// Builds data/events.json: where the listed authors are going to be, New York
// first. Two kinds of source:
//
//   1. Author feeds (data/authors.json). An author's own events page, as a
//      calendar feed where one exists and as dated text where it does not.
//      Every date counts, wherever it is.
//   2. Venue feeds (data/venues.json). New York calendars, read in full. A
//      listing is kept only if it names a listed author or one of the topics
//      in scripts/lib/match.mjs.
//
// Never fails the build: a broken source is logged and skipped, its last good
// events stay for 14 days, and if most sources fail at once the previous file
// is kept.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { get, sleep } from "./lib/http.mjs";
import { parseByFormat } from "./lib/parsers.mjs";
import { parseDatedText, parseCalendarLinks, htmlToLines, nextPage } from "./lib/dated-text.mjs";
import { classify } from "./lib/place.mjs";
import { buildMatcher, findTopic } from "./lib/match.mjs";
import { stripHtml, decodeEntities } from "./lib/ics.mjs";
import { partsIn, zonedToUtc, TZ } from "./lib/time.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p, fallback) => (existsSync(join(ROOT, p)) ? JSON.parse(readFileSync(join(ROOT, p), "utf8")) : fallback);
const AUTHORS = read("data/authors.json", []);
const VENUES = read("data/venues.json", []);
const PREV = read("data/events.json", { events: [], sources: [] });
const SEEN = read("data/seen.json", {});
const PAGES = read("data/pages.json", {});

const HORIZON_DAYS = 400;
// A source that fails keeps its last good dates this long. Eventbrite and a
// few sites refuse GitHub's servers and are read from a Mac each morning
// (scripts/home-refresh.sh), so this has to outlast a laptop left shut.
const STALE_DAYS = 30;
const CONCURRENCY = 8;
const LUMA_PAGES = 40;
const MAX_PAGES = 8;
const now = Date.now();
const nowIso = new Date(now).toISOString();
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (ms) => {
  const p = partsIn(ms, TZ);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
};
const today = dayOf(now);
const lastDay = dayOf(now + HORIZON_DAYS * 86400000);
const window = { from: now - 6 * 3600000, to: now + HORIZON_DAYS * 86400000 };
const hash = (s) => createHash("sha1").update(s).digest("hex");
const idFor = (...parts) => hash(parts.join("|")).slice(0, 12);
const clip = (s, n = 300) => {
  const t = stripHtml(s ?? "").trim();
  return t ? (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t) : null;
};
const matchAuthors = buildMatcher(AUTHORS);
const authorById = new Map(AUTHORS.map((a) => [a.id, a]));

// ---------- Formats that need more than one request ----------
async function readColumbia(feed) {
  // The feed returns at most 100 per request, so walk the year in windows and
  // split any window that comes back full.
  const out = [];
  const seen = new Set();
  const stamp = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const utc = (v) => (v ? Date.parse(v.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, "$1-$2-$3T$4:$5:$6Z")) : null);
  async function walk(fromMs, toMs) {
    const text = await get(`${feed.url}&start=${stamp(fromMs)}&end=${stamp(toMs)}`);
    const list = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).bwEventList?.events ?? [];
    await sleep(150);
    if (list.length >= 100 && toMs - fromMs > 2 * 86400000) {
      const mid = fromMs + Math.floor((toMs - fromMs) / 2);
      await walk(fromMs, mid);
      await walk(mid, toMs);
      return;
    }
    for (const e of list) {
      if (seen.has(e.guid)) continue;
      seen.add(e.guid);
      const start = utc(e.start?.utcdate);
      if (!start) continue;
      out.push({
        title: decodeEntities(e.summary ?? ""),
        startMs: start,
        endMs: utc(e.end?.utcdate),
        allDay: e.start?.allday === "true",
        url: e.eventlink || feed.url,
        location: stripHtml(e.location?.address ?? "") || null,
        description: clip(e.description),
      });
    }
  }
  for (let m = 0; m < 13; m++) await walk(now + m * 30 * 86400000, now + (m + 1) * 30 * 86400000);
  return out;
}

async function readLuma(feed) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < LUMA_PAGES; page++) {
    const text = await get(feed.url + (cursor ? `&pagination_cursor=${encodeURIComponent(cursor)}` : ""));
    const data = JSON.parse(text);
    for (const entry of data.entries ?? []) {
      const ev = entry.event ?? {};
      const geo = ev.geo_address_info ?? {};
      const hosts = (entry.hosts ?? []).map((h) => h.name).filter(Boolean);
      out.push({
        title: ev.name,
        startMs: Date.parse(ev.start_at),
        endMs: ev.end_at ? Date.parse(ev.end_at) : null,
        allDay: false,
        url: `https://luma.com/${ev.url}`,
        location: ev.location_type === "offline" ? geo.full_address || geo.city_state || null : "Online",
        description: hosts.length ? `Hosted by ${hosts.join(", ")}.` : null,
        hosts: hosts.join(", "),
        lat: ev.coordinate?.latitude ?? null,
        lng: ev.coordinate?.longitude ?? null,
      });
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
    await sleep(200);
  }
  return out;
}

const itemKey = (i) => `${i.day ?? i.startMs}|${i.title}`;
const parseText = (text, feed) => {
  const linked = parseCalendarLinks(text, feed);
  return linked.length ? linked : parseDatedText(text, feed, { today });
};

// Follows a paginated listing until a page adds nothing new or MAX_PAGES.
async function readPages(feed, firstText, parse) {
  const seen = new Set();
  const items = [];
  let text = firstText;
  let url = feed.url;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const fresh = parse(text, feed).filter((i) => !seen.has(itemKey(i)));
    if (!fresh.length) break;
    for (const i of fresh) seen.add(itemKey(i));
    items.push(...fresh);
    const next = nextPage(text, url, page);
    if (!next || next === url) break;
    await sleep(250);
    url = next;
    try {
      text = await get(url);
    } catch {
      break; // the pages already read still count
    }
  }
  return items;
}

// WordPress "The Events Calendar" exports only its next 30 events or so, and
// ignores a date range. Its REST API has the whole year, and where a site has
// turned that off, one export per month gets the same thing.
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
async function readTribeExport(feed) {
  const plain = parseByFormat("ics", await get(feed.url), feed, window);
  const u = new URL(feed.url);
  const rest = await readTribeRest({ ...feed, url: `${u.origin}/wp-json/tribe/events/v1/events` }).catch(() => null);
  if (rest && rest.length >= plain.length) return rest;
  const base = `${u.origin}${u.pathname.replace(/\/$/, "")}`;
  const seen = new Set(plain.map(itemKey));
  const out = [...plain];
  for (let m = 1; m <= 12; m++) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + m);
    const text = await get(`${base}/month/${d.toISOString().slice(0, 7)}/?ical=1`).catch(() => "");
    if (!text.includes("BEGIN:VCALENDAR")) continue;
    for (const i of parseByFormat("ics", text, feed, window)) {
      if (seen.has(itemKey(i))) continue;
      seen.add(itemKey(i));
      out.push(i);
    }
    await sleep(250);
  }
  return out;
}
async function readTribeRest(feed) {
  const events = [];
  const u = new URL(feed.url);
  u.searchParams.set("per_page", "50");
  u.searchParams.set("start_date", isoDay(now));
  u.searchParams.set("end_date", isoDay(now + HORIZON_DAYS * 86400000));
  let url = u.href;
  for (let page = 0; url && page < MAX_PAGES * 2; page++) {
    const data = JSON.parse(await get(url));
    events.push(...(data.events ?? []));
    url = data.next_rest_url ?? null;
    if (url) await sleep(250);
  }
  return parseByFormat("tribe", JSON.stringify({ events }), feed, window);
}
// Eventbrite search lists the soonest first, 20 to a page, and rate-limits
// quickly, so it goes slowly and keeps whatever pages it got.
async function readEventbrite(feed) {
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= 4; page++) {
    let items;
    try {
      items = parseByFormat("jsonld", await get(page === 1 ? feed.url : `${feed.url}?page=${page}`), feed, window);
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    const fresh = items.filter((i) => !seen.has(itemKey(i)));
    if (!fresh.length) break;
    for (const i of fresh) seen.add(itemKey(i));
    out.push(...fresh);
    await sleep(1500);
  }
  return out;
}

async function readFeed(feed, { paged = false } = {}) {
  if (feed.format === "columbia") return { items: await readColumbia(feed) };
  if (feed.format === "luma") return { items: await readLuma(feed) };
  if (feed.format === "tribe") return { items: await readTribeRest(feed) };
  if (feed.format === "jsonld" && /eventbrite\.com\/d\//.test(feed.url)) return { items: await readEventbrite(feed) };
  if (feed.format === "ics" && /[?&]ical=1/.test(feed.url)) return { items: await readTribeExport(feed) };
  const text = await get(feed.url);
  if (feed.format === "text") return { items: paged ? await readPages(feed, text, parseText) : parseText(text, feed), text };
  if (feed.format === "jsonld" && paged) return { items: await readPages(feed, text, (t, f) => parseByFormat("jsonld", t, f, window)), text };
  return { items: parseByFormat(feed.format, text, feed, window), text };
}

// ---------- One instance to one event ----------
function timing(inst, region) {
  // Dated text gives a day and whatever time the page printed. Only a New York
  // date gets a clock time, so a 6:30pm in Rome never reads as 6:30pm Eastern.
  if (inst.day) {
    const [y, mo, d] = inst.day.split("-").map(Number);
    const t = inst.timeText?.match(/(\d{1,2})(?::(\d{2}))?\s*(a|p)\.?m/i);
    if (t && (region === "nyc" || region === "near")) {
      const h = (+t[1] % 12) + (t[3].toLowerCase() === "p" ? 12 : 0);
      return { day: inst.day, endDay: inst.endDay ?? null, allDay: false, startMs: zonedToUtc(y, mo, d, h, +(t[2] ?? 0), 0, TZ), endMs: null };
    }
    return { day: inst.day, endDay: inst.endDay ?? null, allDay: true, startMs: zonedToUtc(y, mo, d, 12, 0, 0, TZ), endMs: null };
  }
  // Before 7am Eastern a talk is a calendar default, not a start time.
  const hour = partsIn(inst.startMs, TZ).h;
  const local = (region === "nyc" || region === "near" || region === "online") && hour >= 7;
  const day = dayOf(inst.startMs);
  const endDay = inst.endMs && dayOf(inst.endMs) !== day ? dayOf(inst.endMs) : null;
  return { day, endDay, allDay: !!inst.allDay || !local, startMs: inst.startMs, endMs: inst.endMs ?? null };
}

function makeEvent(inst, { authors, via, match, topic, sourceId, sourceLabel, venue }) {
  const blob = [inst.title, inst.description].filter(Boolean).join(" ");
  let place = classify({ location: inst.location, text: blob });
  // A venue feed is a New York calendar unless the listing says otherwise.
  if (venue && !venue.unsure && (place.region === "unknown" || (place.region === "nyc" && place.approx))) {
    place = { region: "nyc", place: inst.location?.trim() || venue.name, lat: venue.lat, lng: venue.lng, approx: false };
  }
  if (Number.isFinite(inst.lat) && Number.isFinite(inst.lng)) place = { ...place, lat: inst.lat, lng: inst.lng, approx: false };
  const when = timing(inst, place.region);
  if (!when.day || when.day < today || when.day > lastDay) return null;
  // A course that runs a whole term is not an appearance.
  if (when.endDay && Date.parse(when.endDay) - Date.parse(when.day) > 14 * 86400000) return null;
  // "On the subject" is a New York list. A climate summit in Brussels on the
  // Club of Rome's calendar is not news here unless someone on the list is at it.
  if (via === "topic" && place.region !== "nyc" && place.region !== "near") return null;
  const title = stripHtml(inst.title ?? "").trim();
  if (!title) return null;
  return {
    id: idFor(authors.map((a) => a.id).sort().join(",") || topic?.label || "", when.day, title.toLowerCase()),
    title,
    authorIds: authors.map((a) => a.id),
    authors: authors.map((a) => a.name),
    day: when.day,
    endDay: when.endDay,
    start: new Date(when.startMs).toISOString(),
    end: when.endMs ? new Date(when.endMs).toISOString() : null,
    allDay: when.allDay,
    timeText: inst.timeText ?? null,
    region: place.region,
    place: place.place,
    venue: venue && venue.kind !== "listing" ? venue.name : null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    approxPin: !!place.approx,
    url: inst.url || null,
    description: clip(inst.description),
    via,
    match,
    topic: topic?.label ?? null,
    yearInferred: !!inst.yearInferred,
    sourceId,
    sourceLabel,
  };
}

// ---------- Author feeds ----------
const events = [];
const sources = [];

function recordFailure(id, label, kind, url, err, { homeOnly = false } = {}) {
  const prev = PREV.sources?.find((s) => s.id === id);
  const lastGood = prev?.ok ? PREV.fetchedAt : prev?.lastGood ?? null;
  const fresh = lastGood && now - Date.parse(lastGood) < STALE_DAYS * 86400000;
  const kept = fresh ? (PREV.events ?? []).filter((e) => e.sourceId === id && e.day >= today) : [];
  events.push(...kept);
  console.warn(`fetch-events: ${label}: ${err.message}${kept.length ? ` (kept ${kept.length} from ${lastGood.slice(0, 10)})` : ""}`);
  sources.push({ id, label, kind, url, ok: false, count: kept.length, parsed: 0, lastGood, homeOnly, error: String(err.message).slice(0, 120) });
}

async function readAuthor(a) {
  for (const [i, feed] of (a.feeds ?? []).entries()) {
    const id = `author:${a.id}:${i}`;
    try {
      const { items, text } = await readFeed(feed);
      let n = 0;
      const skip = feed.skip ? new RegExp(feed.skip, "i") : null;
      for (const inst of items) {
        if (skip?.test(inst.title ?? "")) continue;
        // The owner of the page is always on the event; co-authors are found by name.
        const others = matchAuthors(inst.title, inst.description).filter((h) => h.id !== a.id).map((h) => authorById.get(h.id));
        const ev = makeEvent(inst, { authors: [a, ...others], via: "author", match: "site", sourceId: id, sourceLabel: `${a.name}'s site` });
        if (ev) {
          events.push(ev);
          n++;
        }
      }
      // A page we cannot parse can still say "something changed, go and look".
      if (text && feed.format === "text") {
        const visible = hash(htmlToLines(text, feed.url).map((l) => l.text).join("\n"));
        const was = PAGES[a.id];
        PAGES[a.id] = { hash: visible, checkedAt: nowIso, changedAt: was && was.hash !== visible ? nowIso : was?.changedAt ?? null };
      }
      console.log(`fetch-events: ${a.name}: ${n} upcoming (${items.length} parsed)`);
      sources.push({ id, label: a.name, kind: "author", url: feed.url, ok: true, count: n, parsed: items.length });
    } catch (err) {
      recordFailure(id, a.name, "author", feed.url, err);
    }
  }
}

// ---------- Venue feeds ----------
async function readVenue(v) {
  for (const [i, feed] of (v.feeds ?? []).entries()) {
    const id = `venue:${v.id}:${i}`;
    try {
      const { items } = await readFeed(feed, { paged: true });
      let n = 0;
      for (const inst of items) {
        // A host named on the listing is as firm as a name in the title.
        const hits = matchAuthors([inst.title, inst.hosts].filter(Boolean).join(" "), inst.description);
        const topic = hits.length ? null : findTopic(inst.title, inst.description);
        if (!hits.length && !topic) continue;
        const ev = makeEvent(inst, {
          authors: hits.map((h) => authorById.get(h.id)),
          via: hits.length ? "venue" : "topic",
          match: hits.length ? (hits.some((h) => h.where === "title") ? "title" : "listing") : "topic",
          topic,
          venue: v,
          sourceId: id,
          sourceLabel: v.name,
        });
        if (ev) {
          events.push(ev);
          n++;
        }
      }
      // How far ahead this calendar really reaches. A feed that stops after a
      // few weeks is a blind spot, whatever HORIZON_DAYS says.
      const reach = items.reduce((m, i) => {
        const d = i.day ?? (Number.isFinite(i.startMs) ? dayOf(i.startMs) : "");
        return d > m ? d : m;
      }, "");
      console.log(`fetch-events: ${v.name}: ${n} kept (${items.length} read, to ${reach || "nothing"})`);
      sources.push({ id, label: v.name, kind: "venue", url: feed.url, ok: true, count: n, parsed: items.length, reach: reach || null, homeOnly: !!v.homeOnly });
    } catch (err) {
      recordFailure(id, v.name, "venue", feed.url, err, { homeOnly: !!v.homeOnly });
    }
  }
}

async function pool(items, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}
await pool(AUTHORS.filter((a) => a.feeds?.length), readAuthor);
await pool(VENUES, readVenue);

// ---------- Merge duplicates ----------
// The author's own page wins, then a venue that names them in the title.
const RANK = { site: 0, title: 1, listing: 2, topic: 3 };
const STOP = new Set("the and for with from book talk launch event conversation discussion lecture new york city author".split(" "));
const words = (t) => new Set(t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const sameEvent = (a, b) => {
  if (a.day !== b.day) return false;
  if (a.authorIds.length && b.authorIds.length) {
    if (!a.authorIds.some((x) => b.authorIds.includes(x))) return false;
    if (a.via !== b.via) return true; // one person, one day, two sources
    const wa = words(a.title);
    const wb = words(b.title);
    return [...wa].filter((w) => wb.has(w)).length >= Math.min(2, Math.min(wa.size, wb.size));
  }
  // A subject match on the same talk as a named listing: one event, two rows.
  const wa = words(a.title);
  const wb = words(b.title);
  return a.title.toLowerCase() === b.title.toLowerCase() || (a.via !== b.via && [...wa].filter((w) => wb.has(w)).length >= 2);
};
const merged = [];
for (const e of events.slice().sort((a, b) => RANK[a.match] - RANK[b.match])) {
  const hit = merged.find((m) => sameEvent(m, e));
  if (!hit) {
    merged.push({ ...e, alsoAt: [] });
    continue;
  }
  if (e.url && e.url !== hit.url && !hit.alsoAt.includes(e.url)) hit.alsoAt.push(e.url);
  hit.authorIds = [...new Set([...hit.authorIds, ...e.authorIds])];
  hit.authors = [...new Set([...hit.authors, ...e.authors])];
  // A venue knows where it is better than a tour list does.
  if (hit.region !== "nyc" && e.region === "nyc") Object.assign(hit, { region: e.region, place: e.place, lat: e.lat, lng: e.lng, approxPin: e.approxPin });
  if ((hit.lat == null || hit.approxPin) && e.lat != null && !e.approxPin && e.region === hit.region) Object.assign(hit, { place: e.place, lat: e.lat, lng: e.lng, approxPin: false });
  if (hit.allDay && !e.allDay && e.region === hit.region) Object.assign(hit, { start: e.start, end: e.end, allDay: false });
}

// ---------- First seen, which is what orders the RSS feed ----------
const firstRun = !Object.keys(SEEN).length;
for (const e of merged) {
  SEEN[e.id] ??= nowIso;
  e.firstSeen = SEEN[e.id];
}
const keep = new Set(merged.map((e) => e.id));
for (const [id, when] of Object.entries(SEEN)) if (!keep.has(id) && now - Date.parse(when) > 400 * 86400000) delete SEEN[id];

merged.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
const failed = sources.filter((s) => !s.ok).length;
const bad = sources.length && failed / sources.length > 0.6;
if (bad && PREV.events?.length) {
  console.warn(`fetch-events: ${failed} of ${sources.length} sources failed, keeping the previous file`);
} else {
  writeFileSync(join(ROOT, "data/events.json"), JSON.stringify({ fetchedAt: nowIso, horizonDays: HORIZON_DAYS, sources, events: merged, pages: PAGES }, null, 1) + "\n");
  writeFileSync(join(ROOT, "data/seen.json"), JSON.stringify(SEEN, null, 0) + "\n");
  writeFileSync(join(ROOT, "data/pages.json"), JSON.stringify(PAGES, null, 0) + "\n");
}
const count = (r) => merged.filter((e) => e.region === r).length;
console.log(
  `fetch-events: ${merged.length} events (${count("nyc")} New York, ${count("near")} near, ${count("elsewhere")} elsewhere, ${count("online")} online, ${count("unknown")} no place). ` +
    `${sources.length - failed} of ${sources.length} sources read.${firstRun ? " First run." : ""}`
);
