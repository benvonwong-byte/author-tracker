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
