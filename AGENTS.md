# Working in this repo

Authors in Town (authors.dearcrisis.com): a static site plus a Node fetcher, no framework, no dependencies, the same build as Sunset Events (sunset.dearcrisis.com). It shows when writers on the metacrisis, the polycrisis, existential risk and systems come through New York City. Read README.md first, then `HANDOFF.md` for how it keeps running.

## Rules that the build enforces

- `npm run gate` must pass: `scripts/check-voice.mjs` over the author blurbs, the page copy, the scripts and the docs, `scripts/check-data.mjs` over the data files, and the tests.
- Adding a prose field to `data/authors.json`? Add its name to `AUTHOR_FIELDS` in `scripts/check-voice.mjs` in the same commit, or the gate never reads it.
- Adding a feed format? Add it to `readFeed` in `scripts/fetch-events.mjs`, then to `FORMATS` in `scripts/check-data.mjs`.
- `npm run build` ends with `scripts/check-preview.mjs`: the page needs its title, description, canonical link, og and twitter tags and a drawn 1200x630 JPEG card under 280,000 bytes (`scripts/draw-card.mjs`). Never a cropped photo as the card.

## House voice for anything published

Same rules as dearcrisis.com. Plain words. An author's `what` says what they wrote and what it argues, in one or two sentences, with no praise. Only record a `site` you have actually loaded. Never guess a pronoun; the blurbs do not need one.

## Data rules

- Public appearances of people writing in public. A personal address, phone number or private schedule never goes in this repo. `nyc` says where someone teaches or lives only when they say so publicly.
- `data/events.json`, `data/seen.json`, `data/pages.json` and `data/name-search.json` are generated. Do not edit them by hand. `seen.json` is the memory behind the RSS feed: deleting it makes every date look new to every subscriber.
- A site that answers 403 goes in `data/unreadable.json`, which the footer lists for checking by hand. Do not disguise the fetcher to get past a block. The client in `scripts/lib/http.mjs` says who it is.
- The fetcher must never fail the build. A broken feed is logged, named in the footer, and skipped, and its last good dates stay for 30 days.

## A false New York date is the worst bug here

Someone may turn up. `scripts/lib/place.mjs` decides the region, the location field outranks free text, and "The New York Times" is not a place. A listing that only mentions a name is tagged "Named in listing", and the RSS and the page both say to check. A clock time is only shown for New York, near New York and online; a time on a date abroad stays as the page printed it.
