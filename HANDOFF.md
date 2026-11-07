# Handing over Authors in Town

The site rebuilds itself every morning on GitHub's servers. GitHub Actions reads the feeds and GitHub Pages serves the site, both free for a public repository.

## What runs

`.github/workflows/deploy.yml` runs every day at 11:23 UTC, on every push to `main`, and by hand from the Actions tab. It runs the gate, reads every feed, builds, checks the share card, commits the refreshed data on the daily runs, and publishes `dist/`.

## Where it lives

GitHub Pages serves the site at `benvonwong-byte.github.io/author-tracker`. `authors.dearcrisis.com` is a small Cloudflare Worker (`worker/index.js`, deployed with `npx wrangler deploy`, not by CI) that forwards every request there and caches good answers for five minutes. A Worker is there because the Cloudflare login this project has can attach a domain to a Worker but cannot edit DNS records. The Worker only changes when `worker/index.js` does, so the daily rebuild does not touch it.

To replace it with a plain record, the way Sunset Events works: run `npx wrangler delete`, add a Cloudflare record (CNAME `authors` to `benvonwong-byte.github.io`, DNS only), then set Settings, Pages, Custom domain to `authors.dearcrisis.com` and enforce HTTPS. Set the record first: setting the domain without it sends the github.io address to a name that does not resolve.

To take the site down: `npx wrangler delete`, then Settings, Pages, Unpublish.

## The sources that need a home connection

Eventbrite, Poets House, Wendy's Subway and the Explorers Club refuse requests from GitHub's servers (`homeOnly` in `data/venues.json`). Eventbrite matters most: The Strand, Greenlight, Books Are Magic and the other bookstores in `data/venues.json` are read through their Eventbrite organizer pages. `scripts/home-refresh.sh` reads every source from a home connection and pushes the result, and GitHub's 11:23 UTC run keeps those sources' dates for 30 days after the last home read.

The home run also searches Eventbrite by author name, 40 authors a morning at one every six seconds, oldest search first, so everyone comes round in about a week if Eventbrite allows it. It stopped the first test at 14 searches, so check `data/name-search.json` after a few mornings to see the real pace. What it finds is remembered in `data/name-search.json`, which GitHub's run reads but never searches. If Eventbrite refuses a search, that morning's searching stops and the rest stay first in line. Set `NAME_SEARCH_LIMIT` to change the daily number.

The home run also opens 92NY, The New School, McNally Jackson and Word in headless Chrome. `home-refresh.sh` installs `puppeteer-core` with `--no-save`, so it is never in `package.json`, and it uses the Mac's Google Chrome (`CHROME_PATH` to change that). `docs/coverage.md` has the rules: the browser says what it is, and a refusal is final for the day.

`scripts/install-home-refresh.sh` installs the home run as a daily 5:50 AM launch agent, `com.dearcrisis.authors-refresh`, with logs in `/tmp/dc-authors-refresh.*.log`. **It is not installed yet.** Until it is, those sources only update when someone runs `home-refresh.sh` by hand, and their dates drop 30 days after that. The agent runs a copy of the script, so run the install script again after changing `home-refresh.sh`. Sunset Events' `HANDOFF.md` has the options if no Mac is available.

Remove the agent with:

```bash
launchctl bootout gui/$(id -u)/com.dearcrisis.authors-refresh
rm ~/Library/LaunchAgents/com.dearcrisis.authors-refresh.plist
rm -rf ~/.authors-refresh
```

## Still open

- Review the author list. Many blurbs in `data/authors.json` rely partly on general knowledge of the book, and a few shelf authors are off topic.
- Write to 92NY, New York Public Library and The Center for Fiction about a feed. `docs/coverage.md` says what is still out of reach.

## Good to know

- Eventbrite refuses requests from data centers (see Sunset's `HANDOFF.md`), so GitHub's run gets nothing from it and the footer says so. The bookstore dates depend on the home run.
- GitHub pauses scheduled workflows in a public repository after 60 days with no activity. The daily data commit counts as activity, unless no date changes for 60 days.
- Dates from a source that fails stay for 30 days after its last good read, then drop.

## Day to day

- **An author's dates look wrong.** Run `node scripts/try-page.mjs <id> --lines` to see what the parser saw, then adjust that feed's options in `data/authors.json`.
- **A page redesign breaks a parse.** Its count falls to zero and nothing else breaks. The directory still shows when the page last changed.
- **Turning it off.** Actions, the workflow's "..." menu, Disable workflow stops the refresh and leaves the last version online. Settings, Pages, Unpublish takes it down.
