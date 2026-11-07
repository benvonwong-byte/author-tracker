import { test } from "node:test";
import assert from "node:assert/strict";
import { findDate, parseDatedText, parseCalendarLinks, nextPage } from "../scripts/lib/dated-text.mjs";
import { classify } from "../scripts/lib/place.mjs";
import { buildMatcher, findTopic } from "../scripts/lib/match.mjs";
import { parseEventbriteOrganizer, parsePrhEvents, searchSlug, parseIndieCommerceEvents, parse92nyHits, parseNewSchoolHits } from "../scripts/lib/listings.mjs";

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

test("nextPage follows a real next link and nothing else", () => {
  const url = "https://example.org/events/";
  assert.equal(nextPage(`<a href="/events/page/2/">2</a>`, url, 1), "https://example.org/events/page/2/");
  assert.equal(nextPage(`<a href="?page=3">3</a><a href="?page=2">2</a>`, url, 1), "https://example.org/events/?page=2");
  assert.equal(nextPage(`<link rel="next" href="https://example.org/events?offset=20">`, url, 1), "https://example.org/events?offset=20");
  assert.equal(nextPage(`<a href="https://other.org/events/page/2/">2</a>`, url, 1), null);
  assert.equal(nextPage(`<a href="/about">About</a>`, url, 1), null);
});

test("an Eventbrite organizer page: its events, without the cancelled ones", () => {
  const event = { name: "Tim Wu: The Age of Extraction", url: "https://www.eventbrite.com/e/1", start_date: "2026-12-01", start_time: "19:30:00", end_date: "2026-12-01", is_online_event: false, is_cancelled: false, primary_venue: { name: "Strand Bookstore", address: { localized_address_display: "828 Broadway, New York, NY 10003", latitude: "40.73", longitude: "-73.99" } } };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { upcomingEvents: [event, { ...event, name: "Gone", is_cancelled: true }, { ...event, name: "Online", is_online_event: true, start_time: "00:00:00" }] } } })}</script>`;
  const items = parseEventbriteOrganizer(html);
  assert.deepEqual(items.map((i) => i.title), ["Tim Wu: The Age of Extraction", "Online"]);
  assert.equal(items[0].timeText, "7:30pm");
  assert.equal(items[0].location, "Strand Bookstore, 828 Broadway, New York, NY 10003");
  assert.equal(items[0].lat, 40.73);
  assert.equal(items[1].location, "Online");
  assert.equal(items[1].timeText, null);
  assert.throws(() => parseEventbriteOrganizer("<html></html>"));
});

test("Penguin Random House: a date with a local clock time, and the page total", () => {
  const block = (author, book, start) => `<div class="result-item clearfix"><a href="/authors/1/x">p</a><div itemprop="startDate" content="${start}">x</div><div class="author" itemprop="name">
  <h2><a href="/authors/1/x" class="author-name">${author}</a></h2></div><div class="author-of">Author of <a href="/books/1/">${book}</a></div><div class="hdr" itemprop="name">92nd Street Y</div><span itemprop="streetAddress">1395 Lexington Ave</span><span itemprop="addressLocality">New York</span><span itemprop="addressRegion">NY</span><span itemprop="postalCode">10128</span></div>`;
  const { items, total } = parsePrhEvents(`<div totalResults="41"></div>${block("A &amp; B", "Title", "2026-12-01T19:30:00+0000")}${block("C", "Other", "2026-12-02T00:00:00+0000")}`);
  assert.equal(total, 41);
  assert.equal(items[0].title, "A & B: Title");
  assert.equal(items[0].day, "2026-12-01");
  assert.equal(items[0].timeText, "7:30pm");
  assert.equal(items[0].location, "92nd Street Y, 1395 Lexington Ave, New York, NY 10128");
  assert.equal(items[1].timeText, null);
  assert.equal(classify({ location: items[0].location, text: items[0].title }).region, "nyc");
  assert.equal(classify({ location: "NY BOOKS, 1 MAIN ST, NEW YORK, NY 10001", text: "x" }).region, "nyc");
});

test("the Eventbrite search word for a name", () => {
  assert.equal(searchSlug("Slavoj Žižek"), "slavoj-zizek");
  assert.equal(searchSlug("Emily M. Bender"), "emily-m-bender");
});

test("a bookstore calendar on the shared template", () => {
  const html = `<article id="event-1" class="event-list"><h3 class="event-list__title"><a href="/event/2026-11-30/x">Tiffany&#039;s Book Club</a></h3><div class="event-list__body"> Join us </div><span class="event-list__details--label">Date: </span> Mon, 11/30/2026 <span class="event-list__details--label">Time: </span> 7:00pm - 8:30pm <span class="address-line1">McNally Jackson Seaport</span><span class="address-line2">4 Fulton Street</span><span class="locality">New York</span>, <span class="administrative-area">NY</span> <span class="postal-code">10038</span></article>`;
  const [e] = parseIndieCommerceEvents(html, "https://mcnallyjackson.com/events/2026/11");
  assert.equal(e.title, "Tiffany's Book Club");
  assert.equal(e.day, "2026-11-30");
  assert.equal(e.timeText, "7:00pm");
  assert.equal(e.location, "McNally Jackson Seaport, 4 Fulton Street, New York, NY 10038");
  assert.equal(e.url, "https://mcnallyjackson.com/event/2026-11-30/x");
});

test("92NY: the clock time is New York's, written as if it were UTC", () => {
  const seven = Date.UTC(2026, 10, 12, 19, 0) / 1000;
  const [e, ...rest] = parse92nyHits([{ Title: "A Debate", URL: "/event/a", ShortDesc: "<em>Two</em> people", FuturePerformances: [{ perf_dt: seven }, { perf_dt: seven + 3600 }] }]);
  assert.equal(e.day, "2026-11-12");
  assert.equal(e.timeText, "7pm");
  assert.equal(e.description, "Two people");
  assert.equal(rest.length, 0);
});

test("The New School: only the next date of a listing", () => {
  const day = 86400000;
  const now = Date.UTC(2026, 10, 6);
  const items = parseNewSchoolHits([{ objectID: "a", title: "Series", tns_dates: [now - 9 * day, now + 2 * day, now + 3 * day] }, { objectID: "a", title: "Series", tns_dates: [now + 2 * day] }], now);
  assert.equal(items.length, 1);
  assert.equal(items[0].startMs, now + 2 * day);
});
