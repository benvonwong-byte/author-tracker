# What the tracker can and cannot see

Checked 6 November 2026.

## Read every morning

225 authors are followed by name. 48 of them have an events page or feed that is read directly, and most of the rest have a known site with no dated appearances on it. They are found only when a calendar names them.

100 organizations are read, 152 sources in all: New York University (ICS, about 1,050 events), Columbia University (JSON, about 360), Luma's New York listings (about 1,500), five Eventbrite searches, museums and talk venues, the Dear Crisis hub organizations, and the calendars of institutes that authors work with. The institutes marked `unsure` in `data/venues.json` are not New York organizations, so their listings only count when they name a listed author or say they are in New York.

An author's own page is the only source that puts them at an event without naming them in the listing. An institute's calendar that does not name the person (Local Futures for Helena Norberg-Hodge, for example) goes in `data/venues.json`, not on the author, so nobody is shown at an event they are not at.

## How far ahead it looks

The fetcher keeps anything in the next 400 days, but that only helps if a source hands over that much. Several do not by default, so each has its own handling:

| Source | Limit | What the fetcher does |
|---|---|---|
| Columbia | 100 events per request | Walks the year, and splits any window that comes back full |
| WordPress calendars | Exports only their next 30 or so events | Uses the REST API, or one export per month |
| Paginated event pages | The first page only holds the soonest | Follows next-page links, up to 8 |
| Eventbrite | 20 per page, soonest first | Reads up to 4 pages, slowly |

Run `node scripts/show-events.mjs --reach` to see how far each calendar really goes. A small organization that only lists the next few weeks shows up short here, and nothing can be done about that from this side. Each source's furthest date is stored as `reach` in `data/events.json`.

## Read from a home connection only

Eventbrite (405), Poets House (403), Wendy's Subway (no connection) and the Explorers Club (a challenge page instead of its feed) refuse GitHub's servers and load from a home connection. `scripts/home-refresh.sh` reads them from a home connection; `HANDOFF.md` says how to run it every morning. In the footer they show as "read from a home connection" with the date.

## Not read

These are in `data/unreadable.json` and the page footer.

| Calendar | Why |
|---|---|
| The Strand, McNally Jackson, Greenlight, Word, Book Culture | Answer 403 to automated requests, including their RSS addresses |
| CUNY Graduate Center, Asia Society, Fordham, American Museum of Natural History | Answer 403 |
| New York Insight, Prospect Park Alliance | A Cloudflare challenge on every URL, feeds included, from everywhere |
| Billion Oyster Project | Moved to Webflow; the events load from a widget with no readable data |
| The Center for Fiction, PEN America, Museum of Modern Art, Columbia Climate School, Center on Sustainable Development | Answer 403 |
| 92NY, New York Public Library, Brooklyn Public Library, The New School, Books Are Magic | Build the calendar in the browser, so the page has no dates in it |

This is the biggest gap. A New York book launch is most often at one of those bookstores or at 92NY, so an author with no site of their own and a launch at The Strand will be missed.

## Ways to close the gap

1. **Ask the venues.** A bookstore that wants its events found may be willing to share a feed or allow this one client. Worth one email each to The Strand, McNally Jackson and Greenlight, and from Dear Crisis it is not a cold request.
2. **Publisher publicity pages.** Penguin Random House, Macmillan, Verso and Haymarket list tour dates. Not yet tried.
3. **The New School and New York Public Library** may have a public API behind their pages. Not yet looked for.

Do not disguise the fetcher to get past a 403.
