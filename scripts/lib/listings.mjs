// Two event lists that name an author and a venue in structured data, which is
// how the bookstores and 92NY reach this site when their own pages refuse it.

import { decodeEntities } from "./ics.mjs";

const clockText = (hhmm) => {
  const m = String(hhmm ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!m || (+m[1] === 0 && +m[2] === 0)) return null;
  const h = +m[1];
  return `${h % 12 || 12}${+m[2] ? `:${m[2]}` : ""}${h < 12 ? "am" : "pm"}`;
};

// An Eventbrite organizer page holds its next 12 events as page data. Its
// "show more" address refuses automated requests, so later dates are left to
// the Eventbrite searches.
export function parseEventbriteOrganizer(html, src = {}) {
  const raw = String(html).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error("no page data on the organizer page");
  const list = JSON.parse(raw).props?.pageProps?.upcomingEvents;
  if (!Array.isArray(list)) throw new Error("no event list on the organizer page");
  return list
    .filter((e) => e.start_date && !e.is_cancelled && !e.hide_start_date)
    .map((e) => {
      const v = e.primary_venue;
      const address = v?.address?.localized_address_display;
      const lat = parseFloat(v?.address?.latitude);
      const lng = parseFloat(v?.address?.longitude);
      return {
        title: e.name,
        day: e.start_date,
        endDay: e.end_date && e.end_date !== e.start_date ? e.end_date : null,
        timeText: clockText(e.start_time),
        location: e.is_online_event ? "Online" : [v?.name, address].filter(Boolean).join(", ") || null,
        url: e.url ?? src.url ?? null,
        description: e.summary || null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      };
    });
}

// Penguin Random House's author tour list. The startDate field holds the local
// clock time with a "+0000" on the end, so it is read as printed, never as UTC.
export function parsePrhEvents(html, base = "https://www.penguinrandomhouse.com") {
  const page = String(html);
  const total = +(page.match(/totalResults="(\d+)"/i)?.[1] ?? 0);
  const items = [];
  for (const block of page.split('class="result-item clearfix"').slice(1)) {
    const start = block.match(/itemprop="startDate"\s+content="(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    const author = block.match(/class="author-name">([^<]+)/)?.[1];
    if (!start || !author) continue;
    // The author's block is also marked itemprop="name", so the venue is found
    // by the class beside it.
    const field = (name) => decodeEntities(block.match(new RegExp(`${name === "name" ? 'class="hdr" ' : ""}itemprop="${name}"[^>]*>([^<]+)`))?.[1] ?? "").trim();
    const book = decodeEntities(block.match(/class="author-of">[^<]*<a[^>]*>([^<]+)/)?.[1] ?? "").trim();
    const name = decodeEntities(author).trim();
    const href = block.match(/href="(\/authors\/[^"]+)"/)?.[1];
    const city = [field("addressLocality"), [field("addressRegion"), field("postalCode")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    items.push({
      title: book ? `${name}: ${book}` : name,
      hosts: name,
      day: start[1],
      timeText: clockText(start[2]),
      location: [field("name"), field("streetAddress"), city].filter(Boolean).join(", ") || null,
      url: href ? new URL(href, base).href : base,
      description: book ? `${name}, author of ${book}.` : null,
    });
  }
  return { items, total };
}

// The address word Eventbrite's search expects for a person's name.
export const searchSlug = (name) =>
  String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The bookstore calendar template many independent stores share (IndieCommerce).
// One <article class="event-list"> per event, with the date and time labelled.
export function parseIndieCommerceEvents(html, base) {
  const text = (s) => decodeEntities(String(s ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const items = [];
  for (const block of String(html).split(/<article\b[^>]*class="event-list"[^>]*>/).slice(1)) {
    const title = block.match(/class="event-list__title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const date = block.match(/Date:\s*<\/span>\s*[A-Za-z]*,?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!title || !date) continue;
    const time = block.match(/Time:\s*<\/span>\s*(\d{1,2}(?::\d{2})?\s*[ap]m)/i);
    const field = (cls) => text(block.match(new RegExp(`class="${cls}"[^>]*>([^<]*)<`))?.[1]);
    const city = [field("locality"), [field("administrative-area"), field("postal-code")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    items.push({
      title: text(title[2]),
      day: `${date[3]}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}`,
      timeText: time?.[1]?.replace(/\s+/g, "") ?? null,
      location: [field("address-line1"), field("address-line2"), city].filter(Boolean).join(", ") || null,
      url: new URL(title[1], base).href,
      description: text(block.match(/class="event-list__body"[^>]*>([\s\S]*?)<\/div>/)?.[1]) || null,
    });
  }
  return items;
}

// 92NY's search results. perf_dt holds the New York clock time written as if it
// were UTC: 7pm in the room is 19:00 here, so it is read as printed.
export function parse92nyHits(hits, base = "https://www.92ny.org") {
  const items = [];
  for (const h of hits ?? []) {
    const stamps = (h.FuturePerformances ?? []).map((p) => p.perf_dt).filter(Boolean);
    if (!stamps.length && h.NextPerformanceDateTime) stamps.push(h.NextPerformanceDateTime);
    const days = new Map();
    for (const s of stamps) {
      const iso = new Date(s * 1000).toISOString();
      if (!days.has(iso.slice(0, 10))) days.set(iso.slice(0, 10), iso.slice(11, 16));
    }
    for (const [day, clock] of days) {
      items.push({
        title: decodeEntities(h.Title ?? "").trim(),
        day,
        timeText: clockText(clock),
        location: "92NY, 1395 Lexington Ave, New York, NY 10128",
        url: h.URL ? new URL(h.URL, base).href : base,
        description: decodeEntities(String(h.ShortDesc ?? "").replace(/<[^>]+>/g, "")).trim() || null,
      });
    }
  }
  return items;
}

// The New School's search results: the next date a listing runs, and only that,
// so a concert series does not fill the list.
export function parseNewSchoolHits(hits, nowMs) {
  const seen = new Set();
  const items = [];
  for (const h of hits ?? []) {
    const id = h.objectID ?? h.title;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = (h.tns_dates ?? []).filter((d) => d >= nowMs - 6 * 3600000).sort((a, b) => a - b)[0] ?? h.tns_eventStartDate;
    if (!Number.isFinite(next) || !h.title) continue;
    items.push({
      title: decodeEntities(h.title).trim(),
      startMs: next,
      endMs: null,
      allDay: false,
      url: h.exterUrl ?? "https://events.newschool.edu/",
      location: null,
      description: decodeEntities(String(h.description ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 600) || null,
    });
  }
  return items;
}
