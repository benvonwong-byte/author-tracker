# What the tracker can and cannot see

Checked 6 November 2026.

## Why the list is short

The list is short mostly because few of these authors have a New York date announced, and a longer author list on its own does not change that. On 6 November the sources held about 6,600 upcoming New York listings, and only about 90 were book events. Penguin Random House's New York tour list and the first 12 events on each bookstore's Eventbrite page are mostly fiction, memoir and celebrity books. Bookstores and publishers also post dates a few weeks ahead, so the months beyond spring stay thin however far the fetcher looks.

Tests that shaped the sources:

| Test | Result |
|---|---|
| 171 author sites with no events page, read for upcoming dates | 26 showed any, and about 5 were that author's own |
| 40 more well-known names, against the listings already read | 2 people, 3 dates |
| A wider subject filter on book events | 9 of 87 kept, some of them wrong (a Python class, a novel) |

## Read every morning

271 authors are followed by name. 51 of them have an events page or feed that is read directly, and most of the rest have a known site with no dated appearances on it. They are found when a calendar names them.

115 organizations are read, 171 sources in all: New York University (ICS, about 1,050 events), Columbia University (JSON, about 900), Luma's New York listings (about 1,500), five Eventbrite searches, 16 bookstores and talk venues through their Eventbrite pages, Penguin Random House's New York tour list, museums and talk venues, the Dear Crisis hub organizations, and the calendars of institutes that authors work with. The institutes marked `unsure` in `data/venues.json` are not New York organizations, so their listings only count when they name a listed author or say they are in New York.

Haymarket Books and Common Notions have `allOnSubject` set: their whole list is on these subjects, so a New York event of theirs is kept with no phrase match.

An author's own page is the only source that puts them at an event without naming them in the listing. An institute's calendar that does not name the person (Local Futures for Helena Norberg-Hodge, for example) goes in `data/venues.json`, not on the author, so nobody is shown at an event they are not at.

## Eventbrite, searched by author

The home run searches Eventbrite for 40 authors a morning, one every six seconds, oldest search first, so each author comes round about once a week. Results are remembered in `data/name-search.json` for 30 days, and GitHub's run reads that memory. A listing only counts if it has the author's full name. If Eventbrite answers 429, the morning's searching stops and the rest go first the next day. On 6 November it answered 429 after 16 searches at one every 2.5 seconds, and after 14 more at one every six seconds, both on top of the other Eventbrite requests. If mornings also stop that early, a full round takes closer to three weeks. The first 30 searches found no listed author, so this source has yet to prove itself.

## How far ahead it looks

The fetcher keeps anything in the next 400 days, but that only helps if a source hands over that much. Several do not by default, so each has its own handling:

| Source | Limit | What the fetcher does |
|---|---|---|
| Columbia | 100 events per request | Walks the year, and splits any window that comes back full |
| WordPress calendars | Exports only their next 30 or so events | Uses the REST API, or one export per month |
| Paginated event pages | The first page only holds the soonest | Follows next-page links, up to 8 |
| Eventbrite search | 20 per page, soonest first | Reads up to 4 pages, slowly |
| Eventbrite organizer page | Its next 12 events | Reads those. The "show more" address answers 403, so it is left alone, and the searches reach later dates |
| Penguin Random House | 10 per page, no next-page link | Walks the year by date and splits any window with more than one page. New York only (25 miles of 10003), because the national list has about 890 events and answered a 500 under that many requests |

Run `node scripts/show-events.mjs --reach` to see how far each calendar really goes. A small organization that only lists the next few weeks shows up short here, and nothing can be done about that from this side. Each source's furthest date is stored as `reach` in `data/events.json`.

## Read from a home connection only

Eventbrite (405), Poets House (403), Wendy's Subway (no connection) and the Explorers Club (a challenge page instead of its feed) refuse GitHub's servers and load from a home connection. `scripts/home-refresh.sh` reads them; `HANDOFF.md` says how to run it every morning. The bookstores depend on this. In the footer they show as "read from a home connection" with the date.

## Not read

These are in `data/unreadable.json` and the page footer.

| Calendar | Why |
|---|---|
| McNally Jackson, Word, Book Culture | Answer 403 to automated requests, including their RSS addresses |
| CUNY Graduate Center, Asia Society, Fordham, American Museum of Natural History | Answer 403 |
| 92NY, New York Public Library | Answer a small bot-check page. Penguin Random House authors at 92NY still reach this site through its tour list |
| The New School | Answers a security check, or 429 |
| New York Insight, Prospect Park Alliance | A Cloudflare challenge on every URL, feeds included, from everywhere |
| Billion Oyster Project | Moved to Webflow; the events load from a widget with no readable data |
| Brooklyn Public Library | Builds the calendar in the browser, so the page has no dates in it |
| The Center for Fiction, PEN America, Museum of Modern Art, Columbia Climate School, Center on Sustainable Development | Answer 403 |

Publishers that do not list readable tour dates: Macmillan, Simon & Schuster and HarperCollins answer 403, Hachette and Norton have no events page at the usual address, and Verso's page has no dates in it.

## Ways to close the gap

1. **Ask the venues.** 92NY, New York Public Library, The New School and McNally Jackson may be willing to share a feed or allow this one client. From Dear Crisis it is not a cold request.
2. **Search the web by author.** A weekly search for each name would find what no calendar here shows, but it needs a paid search service. Not tried.
3. **Keep adding names as they appear.** Reading the Penguin Random House and bookstore lists by hand turned up James Gleick and Ed Yong, who were missing.

Do not disguise the fetcher to get past a 403.
