import { test } from "node:test";
import assert from "node:assert/strict";
import { findDate, parseDatedText, parseCalendarLinks } from "../scripts/lib/dated-text.mjs";
import { classify } from "../scripts/lib/place.mjs";
import { buildMatcher, findTopic } from "../scripts/lib/match.mjs";

const today = "2026-11-06";
const parse = (html, src = {}) => parseDatedText(html, { url: "https://example.org/", ...src }, { today });

test("findDate reads the shapes authors type", () => {
  assert.deepEqual([findDate("November 10, 2026").m, findDate("November 10, 2026").d, findDate("November 10, 2026").y], [11, 10, 2026]);
  assert.equal(findDate("Thursday 26th November 2026").d, 26);
  const range = findDate("Aug 12–13, 2026");
  assert.deepEqual([range.d, range.endD, range.y], [12, 13, 2026]);
  const across = findDate("Oct 31 to Nov 1");
  assert.deepEqual([across.m, across.d, across.endM, across.endD], [10, 31, 11, 1]);
  assert.equal(findDate("published in October 2026"), null);
});

test("a tour list: date, city, title, time, venue", () => {
  const [e] = parse(`<p>November 10, 2026</p><p>Rome, Italy</p><p>“Resisting the New Fascisms”, hosted by Internazionale</p><p>Time: 6:30pm</p><p>Location: Esc Atelier</p>`);
  assert.equal(e.day, "2026-11-10");
  assert.equal(e.title, "Resisting the New Fascisms, hosted by Internazionale");
  assert.equal(e.timeText, "6:30pm");
  assert.match(e.location, /Esc Atelier/);
});

test("the city above the date, and a date set across three lines", () => {
  const [e] = parse(`<div>London, UK</div><div>5</div><div>December</div><div>2026</div><div>Where Is the World Heading?</div><div>Event Website</div>`, { placeBefore: true });
  assert.equal(e.day, "2026-12-05");
  assert.equal(e.location, "London, UK");
  assert.equal(e.title, "Where Is the World Heading?");
});

test("a place-only line after a placeBefore event belongs to the next one", () => {
  const [first, second] = parse(`<div>7 November 2026</div><div>AI Talk (Virtual)</div><div>Tel Aviv, Israel</div><div>26 November 2026</div><div>On Minds</div>`, { placeBefore: true });
  assert.equal(first.location, null);
  assert.equal(second.location, "Tel Aviv, Israel");
});

test("a yearless date is dropped unless the page is kept current", () => {
  assert.equal(parse(`<p>JUN 2-5</p><p>The Dream</p>`).length, 0);
  const [e] = parse(`<p>Montreal: World Science Fiction Convention, Sep 2-6</p><p>https://montreal2027.ca/en</p>`, { yearless: true, placeFirst: true });
  assert.equal(e.day, "2027-09-02");
  assert.equal(e.endDay, "2027-09-06");
  assert.equal(e.location, "Montreal");
  assert.equal(e.url, "https://montreal2027.ca/en");
});

test("a month heading sets the year below it", () => {
  const [e] = parse(`<div>November 2026</div><div>06 Nov</div><div>Awards Night (Bruno Walter Auditorium, New York City, NY)</div>`);
  assert.equal(e.day, "2026-11-06");
});

test("classify: New York by name, by venue, and never by a newspaper", () => {
  assert.equal(classify({ location: "245 Varet St, Brooklyn, NY 11206" }).region, "nyc");
  assert.equal(classify({ text: "A talk at Columbia University" }).region, "nyc");
  assert.equal(classify({ location: "Rome, Italy", text: "with The New York Review of Books" }).region, "elsewhere");
  assert.equal(classify({ text: "Writes for The New York Times" }).region, "unknown");
  assert.equal(classify({ text: "NYU Abu Dhabi lecture" }).region, "elsewhere");
});

test("classify: near, abroad, online, unknown", () => {
  assert.equal(classify({ location: "Princeton, NJ" }).region, "near");
  assert.equal(classify({ location: "Westport Library, Westport, CT" }).region, "near");
  assert.equal(classify({ location: "Collegio Borromeo, Pavia, Italy" }).region, "elsewhere");
  assert.equal(classify({ location: "Bellingham, WA" }).region, "elsewhere");
  assert.equal(classify({ location: "Online via Zoom" }).region, "online");
  assert.equal(classify({ text: "Q&A on Zoom, 6.00pm to 7.45pm UK time" }).region, "online");
  assert.equal(classify({ text: "Pomona College" }).region, "unknown");
});

test("the matcher wants a whole name, folds accents, and asks for context on common names", () => {
  const m = buildMatcher([
    { id: "klein", name: "Naomi Klein" },
    { id: "torres", name: "Émile P. Torres", aliases: ["Émile Torres"] },
    { id: "mann", name: "Michael E. Mann", aliases: ["Michael Mann"], needsContext: true },
  ]);
  assert.deepEqual(m("Naomi Klein in conversation", "").map((h) => [h.id, h.where]), [["klein", "title"]]);
  assert.deepEqual(m("A reading group", "On a book by Naomi Klein").map((h) => h.where), ["description"]);
  assert.equal(m("Naomi Kleinberg speaks", "").length, 0);
  assert.equal(m("Emile Torres on extinction", "").length, 1);
  assert.equal(m("Michael Mann film retrospective: Heat", "").length, 0);
  assert.equal(m("Michael Mann on the climate", "").length, 1);
});

test("a topic counts in a title anywhere, and in a description only at a talk", () => {
  assert.equal(findTopic("Polycrisis Now", "").label, "polycrisis");
  assert.equal(findTopic("Weekly meetup", "We chat about existential risk"), null);
  assert.equal(findTopic("Book talk", "On existential risk").label, "existential risk");
  assert.equal(findTopic("System collapse dance party", ""), null);
});

test("a publish stamp and a byline are not an event", () => {
  assert.equal(findDate("2026-11-06T00:00:00-08:00"), null);
  assert.equal(parse(`<p>November 6, 2026</p><p>Kat</p>`).length, 0);
});

test("a time left on its own is not a title", () => {
  const [e] = parse(`<p>Saturday, November 7, 2026, 7-9 PM PST</p><p>18:00</p><p>Our Time to Thrive</p>`);
  assert.equal(e.title, "Our Time to Thrive");
  assert.equal(parse(`<p>Nov 7, 2026</p><p>18:00</p>`).length, 0);
});

test("Google Calendar links give the exact title, time and place", () => {
  const html = `<a href="http://www.google.com/calendar/event?action=TEMPLATE&amp;text=Portland%20Book%20Festival&amp;dates=20261108T020000Z/20261108T030000Z&amp;location=Portland%2C%20OR">Google Calendar</a>`;
  const [e] = parseCalendarLinks(html, { url: "https://example.org/events" });
  assert.equal(e.title, "Portland Book Festival");
  assert.equal(e.location, "Portland, OR");
  assert.equal(new Date(e.startMs).toISOString(), "2026-11-08T02:00:00.000Z");
  assert.equal(e.url, "https://example.org/events");
});
