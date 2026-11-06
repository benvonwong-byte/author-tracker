// Reads tour dates out of a page written for people. Most authors keep a plain
// list on their own site, with no calendar feed behind it: a date, a city, a
// title, in whatever order they typed them. This finds the dates and treats
// the lines around each one as that event.
//
// Per-source options, all optional, set on the feed in data/authors.json:
//   start        regex: ignore everything before the first line that matches
//   stop         regex: ignore everything from the first line that matches
//   placeBefore  the city is on the line above the date (ynharari.com)
//   titleBefore  the title is on the line above the date
//   placeFirst   "Kilkenny: Hinterland Festival" names the city before the colon
//   yearless     dates with no year mean the next time that date comes round.
//                Only for pages kept current: an old page full of "JUN 2-5"
//                would otherwise read as next June.

import { decodeEntities } from "./ics.mjs";
import { looksLikePlace } from "./place.mjs";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const WD = "(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s+)?";
const ORD = "(?:st|nd|rd|th)?";
const YEAR = "(?:,?\\s+(20\\d\\d))?";
const DASH = "\\s*(?:-|–|to|through)\\s*";

// "Nov 1-3, 2026", "Oct 31 to Nov 1", "Wednesday, April 8, 2026"
const MD = new RegExp(`(?<![\\w])${WD}${MON}\\s+(\\d{1,2})${ORD}(?!\\d)(?:${DASH}(?:${MON}\\s+)?(\\d{1,2})${ORD}(?!\\d))?${YEAR}(?!\\d)`, "i");
// "26th November 2026", "7 November 2026", "06 Nov"
const DM = new RegExp(`(?<![\\w:])${WD}(\\d{1,2})${ORD}(?:${DASH}(\\d{1,2})${ORD})?\\s+${MON}${YEAR}(?!\\d)`, "i");
// 2026-11-06
// A stamp with a time on it ("2026-11-06T00:00:00") is when a page was published,
// not an event, so only a bare date counts.
const ISO = /(?<![\w-])(20\d\d)-(\d{2})-(\d{2})(?![\d-]|T\d)/;
// A heading such as "November 2026" sets the year for the dates below it.
const MONTH_HEAD = new RegExp(`^${MON}\\s+(20\\d\\d)$`, "i");

const TIME_RE = /\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?:\s*(?:-|–|to)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))?/i;
const NOISE = /^(?:tickets?|rsvp|register|sign up|view event|event website|event details?|details|more info(?:rmation)?|learn more|read more|find out more|book now|buy tickets?|map|\(map\)|google calendar|ics|add to calendar|free|free event|live ticketed event|online ticketed event|see all|time:?|date:?|location:?|where:?|when:?|upcoming(?: events?)?|recent & upcoming)\.?$/i;

const SECTION_END = /^(?:past|previous|upcoming|recent|all)(?: & upcoming)? (?:events?|talks?|engagements?|appearances?)\b|^no event found/i;

// What is left of a line once its date and time are gone: "18:00", "7– PST".
const NO_WORDS = /^[\d\s:.,–-]*(?:am|pm|a\.m\.|p\.m\.)?\s*(?:PST|PDT|EST|EDT|ET|PT|CST|CDT|MST|MDT|CET|CEST|GMT|BST|UTC)?$/i;

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// Block tags become line breaks; each line keeps the links it holds.
export function htmlToLines(html, base) {
  const marked = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>/gi, (_, h) => `\u0001${h}\u0002`)
    .replace(/<\/?(?:br|p|div|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|nav|main|aside|dl|dt|dd|hr|blockquote|figure|figcaption|time)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const lines = [];
  for (const raw of decodeEntities(marked).split("\n")) {
    const links = [];
    const text = raw
      .replace(/\u0001([^\u0002]*)\u0002/g, (_, h) => {
        try {
          const u = new URL(h, base);
          if (/^https?:$/.test(u.protocol)) links.push(u.href);
        } catch {
          /* not a URL */
        }
        return " ";
      })
      .replace(/[\s ]+/g, " ")
      .trim();
    if (text || links.length) lines.push({ text, links });
  }
  return joinDateFragments(lines);
}

// Designers set dates as big numerals, so "7", "November", "2026" arrive as
// three lines. Put them back together before looking for dates.
const FRAGMENT = new RegExp(`^(?:\\d{1,2}${ORD}|${MON}|20\\d\\d)$`, "i");
const WHOLE_DATE = new RegExp(`^(?:${MD.source}|${DM.source})$`, "i");
function joinDateFragments(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let joined = false;
    for (const n of [3, 2]) {
      const part = lines.slice(i, i + n);
      if (part.length < n || !part.every((l) => l.text.length <= 12 && FRAGMENT.test(l.text))) continue;
      const text = part.map((l) => l.text).join(" ");
      if (!WHOLE_DATE.test(text)) continue;
      out.push({ text, links: part.flatMap((l) => l.links) });
      i += n - 1;
      joined = true;
      break;
    }
    if (!joined) out.push(lines[i]);
  }
  return out;
}

// The first date in a line of text, or null.
export function findDate(text) {
  const iso = text.match(ISO);
  if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3], at: iso.index, len: iso[0].length };
  const md = text.match(MD);
  const dm = text.match(DM);
  if (md && (!dm || md.index <= dm.index)) {
    const m = MONTHS[md[1].slice(0, 3).toLowerCase()];
    const out = { y: md[5] ? +md[5] : null, m, d: +md[2], at: md.index, len: md[0].length };
    if (md[4]) {
      out.endM = md[3] ? MONTHS[md[3].slice(0, 3).toLowerCase()] : m;
      out.endD = +md[4];
    }
    return out;
  }
  if (dm) {
    const m = MONTHS[dm[3].slice(0, 3).toLowerCase()];
    const out = { y: dm[4] ? +dm[4] : null, m, d: +dm[1], at: dm.index, len: dm[0].length };
    if (dm[2]) {
      out.endM = m;
      out.endD = +dm[2];
    }
    return out;
  }
  return null;
}

const cleanTitle = (s) =>
  s
    .replace(/^[\s,.:;·•|*–-]+|[\s,.:;·•|*–-]+$/g, "")
    .replace(/\s*(?:View Event|Google Calendar|ICS)\s*→?\s*$/i, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+,/g, ",")
    .trim();

export function parseDatedText(html, src, { today }) {
  // An RSS feed reads the same way once its CDATA wrappers are gone.
  let lines = htmlToLines(String(html).replace(/<!\[CDATA\[|\]\]>/g, ""), src.page ?? src.url);
  if (src.start) {
    const re = new RegExp(src.start, "i");
    const i = lines.findIndex((l) => re.test(l.text));
    if (i >= 0) lines = lines.slice(i + 1);
  }
  // Past dates fall away by themselves, so a page only needs a stop when its
  // old entries have no year. "Past events" is often a tab above the list, and
  // stopping there by default would lose the whole page.
  if (src.stop) {
    const stop = new RegExp(src.stop, "i");
    const cut = lines.findIndex((l) => stop.test(l.text));
    if (cut >= 0) lines = lines.slice(0, cut);
  }

  // Mark every line that opens an event.
  const openers = [];
  let headingYear = null;
  lines.forEach((line, i) => {
    const head = line.text.match(MONTH_HEAD);
    if (head) {
      headingYear = +head[2];
      return;
    }
    if (line.text.length > 200) return; // a date inside a paragraph of prose
    const date = findDate(line.text);
    if (date) openers.push({ i, date: { ...date, y: date.y ?? headingYear } });
  });

  const thisYear = +today.slice(0, 4);
  const out = [];
  openers.forEach(({ i, date }, n) => {
    let y = date.y;
    let yearInferred = false;
    if (!y) {
      if (!src.yearless) return;
      y = thisYear;
      if (dayKey(y, date.m, date.d) < today) y += 1;
      yearInferred = true;
    }
    if (!validDay(y, date.m, date.d)) return;
    const day = dayKey(y, date.m, date.d);
    let endDay = null;
    if (date.endD) {
      const endY = date.endM < date.m ? y + 1 : y;
      if (validDay(endY, date.endM, date.endD)) endDay = dayKey(endY, date.endM, date.endD);
    }

    const next = openers[n + 1]?.i ?? lines.length;
    const block = [];
    for (const line of lines.slice(i, Math.min(next, i + 8))) {
      // A section heading ends the event above it.
      if (block.length && SECTION_END.test(line.text)) break;
      block.push(line);
    }
    const first = block[0].text;
    const rest = [cleanTitle(first.slice(0, date.at) + " " + first.slice(date.at + date.len)), ...block.slice(1).map((l) => l.text)].filter(Boolean);

    let location = null;
    let timeText = null;
    const textLines = [];
    for (const raw of rest) {
      const time = raw.match(TIME_RE);
      if (time && !timeText) timeText = time[0].replace(/\s+/g, " ");
      const labelled = raw.match(/^(?:location|where|venue)\s*:\s*(.+)$/i);
      if (labelled) {
        location = location ? `${labelled[1]}, ${location}` : labelled[1];
        continue;
      }
      if (/^(?:time|when|date)\s*:/i.test(raw) || /^https?:\/\/\S+$/.test(raw)) continue;
      const stripped = cleanTitle(raw.replace(TIME_RE, " ").replace(/\s+/g, " "));
      if (!stripped || NOISE.test(stripped) || NO_WORDS.test(stripped) || findDate(stripped)?.len === stripped.length) continue;
      if (looksLikePlace(stripped)) {
        // With placeBefore, a place-only line here belongs to the next event.
        if (!location && !src.placeBefore) location = stripped;
        continue;
      }
      textLines.push(stripped);
    }
    if (src.placeBefore) {
      const before = lines[i - 1]?.text;
      if (before && looksLikePlace(before)) location = before;
    }
    // Some lists put the title above the date.
    if (src.titleBefore) {
      const above = cleanTitle(lines[i - 1]?.text ?? "");
      if (above && !NOISE.test(above) && !findDate(above)) textLines.unshift(above);
    }

    // "Kilkenny: Hinterland Festival" names the city before the colon.
    let title = textLines[0];
    if (!title) return;
    const colon = title.match(/^([A-Z][\p{L}.'’ -]{2,24}):\s+(.{4,})$/u);
    if (colon && !location && src.placeFirst) {
      location = colon[1];
      title = colon[2];
    }
    title = cleanTitle(title);
    // A real title has a real word in it. This drops bylines such as "Kat".
    if (!/\p{L}{4}/u.test(title)) return;
    if (title.length > 160) title = title.slice(0, 157).trimEnd() + "…";

    const printed = block.map((l) => l.text).find((t) => /^https?:\/\/\S+$/.test(t));
    const url = printed ?? block.flatMap((l) => l.links).find((u) => !/calendar\.google|\.ics($|\?)|\/feed\/?$|format=ical/i.test(u)) ?? src.page ?? src.url;
    const description = textLines.slice(1).join(" ").slice(0, 300) || null;
    out.push({ title, day, endDay, timeText, location, url, description, yearInferred, fromText: true });
  });
  const seen = new Set();
  return out.filter((e) => {
    const k = e.day + "|" + e.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Squarespace and many event plugins print an "Add to Google Calendar" link for
// every event, holding its exact title, time and place. Far more reliable than
// reading the text around a date, so a page that has them is read this way.
export function parseCalendarLinks(html, src) {
  const out = [];
  const seen = new Set();
  for (const m of String(html).matchAll(/href=["']([^"']*(?:google\.com\/calendar\/(?:event|render)|calendar\.google\.com\/calendar\/(?:event|render))\?[^"']*)["']/gi)) {
    let params;
    try {
      params = new URL(decodeEntities(m[1]), "https://www.google.com").searchParams;
    } catch {
      continue;
    }
    const title = params.get("text")?.trim();
    const dates = params.get("dates")?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?(?:\/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?)?$/);
    if (!title || !dates) continue;
    const key = title + dates[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const [, y, mo, d, h, mi, sec, y2, mo2, d2, h2, mi2, sec2] = dates;
    const item = {
      title,
      location: params.get("location")?.trim() || null,
      description: params.get("details")?.trim().slice(0, 300) || null,
      url: src.page ?? src.url,
    };
    if (h) {
      item.startMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
      item.endMs = y2 && h2 ? Date.UTC(+y2, +mo2 - 1, +d2, +h2, +mi2, +sec2) : null;
      item.allDay = false;
    } else {
      item.day = `${y}-${mo}-${d}`;
      item.endDay = y2 && `${y2}-${mo2}-${d2}` !== item.day ? `${y2}-${mo2}-${d2}` : null;
    }
    out.push(item);
  }
  return out;
}
