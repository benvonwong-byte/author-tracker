#!/usr/bin/env node
// Shows what the dated-text parser reads from one author's page, past dates
// included. Usage: node scripts/try-page.mjs <author-id> [--lines]
import { readFileSync } from "node:fs";
import { get } from "./lib/http.mjs";
import { parseDatedText, parseCalendarLinks, htmlToLines } from "./lib/dated-text.mjs";
const authors = JSON.parse(readFileSync(new URL("../data/authors.json", import.meta.url)));
const a = authors.find((x) => x.id === process.argv[2]);
const feed = a.feeds[0];
const html = await get(feed.url);
if (process.argv[3] === "--lines") console.log(htmlToLines(html, feed.url).map((l) => l.text).filter(Boolean).slice(0, 80).join("\n"));
const linked = parseCalendarLinks(html, feed);
if (linked.length) console.log(`(${linked.length} calendar links)`);
for (const e of (linked.length ? linked : parseDatedText(html, feed, { today: "2000-01-01" })).slice(0, 12)) console.log(e.day ?? new Date(e.startMs).toISOString().slice(0, 10), "|", e.location, "|", e.timeText, "|", e.title.slice(0, 70));
