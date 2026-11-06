#!/usr/bin/env node
// Prints data/events.json as a table, for checking a run by eye.
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("../data/events.json", import.meta.url)));
const only = process.argv[2];
for (const e of d.events) {
  if (only && e.region !== only) continue;
  const time = e.allDay ? (e.timeText ?? "") : new Date(e.start).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  console.log([e.day, e.region.padEnd(9), (e.authors.join("+") || `[${e.topic}]`).slice(0, 26).padEnd(26), e.match.padEnd(7), time.padEnd(8), (e.place ?? "-").slice(0, 28).padEnd(28), e.title.slice(0, 72)].join(" | "));
}
const bad = d.sources.filter((s) => !s.ok);
if (bad.length) console.log("\nDid not load:\n" + bad.map((s) => `  ${s.label}: ${s.error}`).join("\n"));
