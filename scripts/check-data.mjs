#!/usr/bin/env node
// Validates data/authors.json and data/venues.json so a hand edit cannot break
// the site: required fields, known subjects, unique ids, http links, and feed
// formats the fetcher can read.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const authors = read("data/authors.json");
const venues = read("data/venues.json");
const unreadable = read("data/unreadable.json");
const CLUSTERS = new Set(["metacrisis", "polycrisis", "xrisk", "systems", "economy", "planet", "culture"]);
const FORMATS = new Set(["text", "ics", "luma", "meetup", "tockify", "civicplus", "squarespace", "tribe", "mobilize", "rss", "rss-future", "jsonld", "eventbrite", "mahina", "fullcalendar", "columbia", "eventbrite-org", "prh", "browser"]);
const isHttp = (u) => typeof u === "string" && /^https?:\/\/\S+$/.test(u);

const errors = [];
function feeds(at, list) {
  for (const f of list ?? []) {
    if (!FORMATS.has(f.format)) errors.push(`${at}: unknown feed format "${f.format}"`);
    if (!isHttp(f.url)) errors.push(`${at}: feed url must be http(s)`);
    if (f.format === "browser" && !f.reader) errors.push(`${at}: a browser feed needs a reader`);
    for (const k of ["start", "stop", "skip"]) {
      if (f[k]) {
        try {
          new RegExp(f[k], "i");
        } catch {
          errors.push(`${at}: feed ${k} is not a valid regex`);
        }
      }
    }
  }
}
const ids = new Set();
for (const a of authors) {
  const at = `authors ${a.id ?? a.name ?? "?"}`;
  if (!a.id || !/^[a-z0-9-]+$/.test(a.id)) errors.push(`${at}: id must be lowercase-kebab`);
  if (ids.has(a.id)) errors.push(`${at}: duplicate id`);
  ids.add(a.id);
  if (!a.name) errors.push(`${at}: missing name`);
  if (!CLUSTERS.has(a.cluster)) errors.push(`${at}: unknown cluster "${a.cluster}"`);
  if (!a.what || a.what.length > 240) errors.push(`${at}: "what" is missing or longer than 240 characters`);
  if (a.site !== null && !isHttp(a.site)) errors.push(`${at}: site must be http(s) or null`);
  if (a.eventsPage !== null && !isHttp(a.eventsPage)) errors.push(`${at}: eventsPage must be http(s) or null`);
  feeds(at, a.feeds);
}
const vids = new Set();
for (const v of venues) {
  const at = `venues ${v.id ?? v.name ?? "?"}`;
  if (!v.id || vids.has(v.id)) errors.push(`${at}: id missing or duplicate`);
  vids.add(v.id);
  if (!v.name) errors.push(`${at}: missing name`);
  if (v.homeOnly !== undefined && typeof v.homeOnly !== "boolean") errors.push(`${at}: homeOnly must be true or false`);
  if (v.allOnSubject !== undefined && (typeof v.allOnSubject !== "string" || !v.unsure)) errors.push(`${at}: allOnSubject must be a label, on a source marked unsure so it only counts in New York`);
  feeds(at, v.feeds);
}
for (const u of unreadable) if (!u.name || !isHttp(u.url)) errors.push(`unreadable ${u.name ?? "?"}: needs a name and a url`);

if (errors.length) {
  console.error(`check-data: ${errors.length} problem(s)\n` + errors.map((e) => "  " + e).join("\n"));
  process.exit(1);
}
console.log(`check-data: ok (${authors.length} authors, ${venues.length} venues, ${unreadable.length} checked by hand)`);
