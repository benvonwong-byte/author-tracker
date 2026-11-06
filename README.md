# Authors in Town

When the writers on the metacrisis, the polycrisis, existential risk and systems come through New York City. Same build and same look as [Sunset Events](https://sunset.dearcrisis.com), a [Dear Crisis](https://dearcrisis.com) project by Benjamin Von Wong. **[HANDOFF.md](HANDOFF.md)** says what keeps it updating.

The page has three views: **Dates** (one list by day, New York first, with chips for near New York, on the subject, elsewhere and online), **Map** (New York or everywhere) and **Authors** (the directory by subject, with each person's next dates).

## How it works

```
data/authors.json ─┐
                   ├─► scripts/fetch-events.mjs ─► data/events.json ─► scripts/build.mjs ─► dist/ ─► GitHub Pages
data/venues.json  ─┘                                                   (site, RSS, .ics, JSON-LD)
```

A GitHub Action runs this every morning and on every push to `main`. A small Cloudflare Worker in `worker/` serves the result at authors.dearcrisis.com. It needs Node 20 or newer, no dependencies and no API keys.

There are two kinds of source, because neither is enough alone:

1. **Author pages.** Most authors keep a plain list of dates on their own site with no feed behind it, so `scripts/lib/dated-text.mjs` finds the dates in the page and reads the lines around each one. A page with "Add to Google Calendar" links is read from those links instead, since they hold the exact title, time and place. Where a real feed exists (Squarespace, WordPress, an ICS file) that is used instead. Every date counts, wherever it is. Each page's text is also hashed, so the directory can say "their events page last changed Nov 5" even when the parser finds nothing.
2. **New York calendars.** NYU, Columbia, Luma's New York listings, Eventbrite searches, museums and the Dear Crisis hub organizations. Each is read in full and a listing is kept only if it names a listed author or one of the subjects in `scripts/lib/match.mjs`.

The subject match is how new names turn up: an NYU talk on AI welfare by someone not on the list appears under "On the subject", and anyone worth following gets added to `data/authors.json`.

## Feeds

| Address | Holds |
|---|---|
| `/feeds/nyc.xml` | RSS: named authors in New York City. The one to subscribe to. |
| `/feeds/all.xml` | RSS: every date everywhere, plus subject matches |
| `/authors-nyc.ics`, `/authors-all.ics` | The same two as calendars |
| `/data/events.json` | Every date with its source |

RSS items are ordered by when the date was first seen, since a date six months off can be today's news. `data/seen.json` is what remembers that.

## Run it

```bash
npm run fetch                          # read every feed into data/events.json (about a minute)
npm run dev                            # build dist/ and serve it at http://localhost:4323
npm run gate                           # language gate, data check, tests
node scripts/show-events.mjs nyc       # print the New York dates as a table
node scripts/try-page.mjs naomi-klein  # what the parser reads from one author's page
```

## Adding an organization

Add it to `data/venues.json` with a feed. A New York organization has its coordinates, and its listings count as New York unless they say otherwise. Anywhere else, set `"unsure": true`, so its listings only count when they name a listed author or say they are in New York. An institute's calendar goes here even when one author runs it: only an author's own page can put them at an event without naming them.

## Adding an author

Add an entry to `data/authors.json`: `id`, `name`, `cluster`, `what`, `site`, `eventsPage`, `feeds`. An author with no events page still gets `"feeds": []`, and venues naming them are picked up.

```json
{ "id": "naomi-klein", "name": "Naomi Klein", "cluster": "polycrisis", "what": "Author of ...", "site": "https://naomiklein.org", "eventsPage": "https://naomiklein.org/events/", "feeds": [{ "format": "text", "url": "https://naomiklein.org/events/" }] }
```

Set `needsContext: true` on a common name (Tim Jackson, Dan Davies), and `aliases` for other spellings. A `text` feed takes `start`, `stop`, `placeBefore`, `titleBefore`, `yearless`, `placeFirst` and `skip`; the comment at the top of `scripts/lib/dated-text.mjs` says what each is for. Run `node scripts/try-page.mjs <id>` to check.

## Sources that refuse GitHub

A few sites answer GitHub's servers with an error but load from a home connection. They are marked `homeOnly` in `data/venues.json`, and `scripts/home-refresh.sh` reads them from a home connection. `HANDOFF.md` has the setup.

## What it does not see

Several of the calendars that matter most refuse automated requests or only build their calendar in a browser: The Strand, McNally Jackson, Greenlight, Word, Book Culture, 92NY, the New York Public Library, Brooklyn Public Library, The New School and others. They are listed in `data/unreadable.json` and in the page footer for checking by hand. `docs/coverage.md` has the detail and the options.
