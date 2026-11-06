# Handing over Authors in Town

The site rebuilds itself every morning on GitHub's servers. GitHub Actions reads the feeds and GitHub Pages serves the site, both free for a public repository.

## What runs

`.github/workflows/deploy.yml` runs every day at 11:23 UTC, on every push to `main`, and by hand from the Actions tab. It runs the gate, reads every feed, builds, checks the share card, commits the refreshed data on the daily runs, and publishes `dist/`.

## First deploy

1. Create the repository and push `main`.
2. Settings, Pages, Source: GitHub Actions.
3. Until the custom domain is set, the site is at benvonwong-byte.github.io/author-tracker.
4. Add a Cloudflare DNS record in the dearcrisis.com zone: CNAME `authors` to `benvonwong-byte.github.io`, DNS only. Then Settings, Pages, Custom domain: `authors.dearcrisis.com`, and enforce HTTPS. Set the record first: setting the domain without it sends the github.io address to a name that does not resolve.

5. In the DearCrisis repo, add this site to the private atlas (`src/data/map/atlas.mjs`), which lists every service the project runs.

## Still open

- Review the author list. Many blurbs in `data/authors.json` rely partly on general knowledge of the book, and a few shelf authors are off topic.
- Write to The Strand, McNally Jackson and Greenlight about a feed. `docs/coverage.md` explains why this is the biggest gap.

## Good to know

- Eventbrite refuses requests from data centers (see Sunset's `HANDOFF.md`), so GitHub's run gets nothing from it and the footer says so. No listing depends on it alone today.
- GitHub pauses scheduled workflows in a public repository after 60 days with no activity. The daily data commit counts as activity, unless no date changes for 60 days.
- Dates from a source that fails stay for 14 days after its last good read, then drop.

## Day to day

- **An author's dates look wrong.** Run `node scripts/try-page.mjs <id> --lines` to see what the parser saw, then adjust that feed's options in `data/authors.json`.
- **A page redesign breaks a parse.** Its count falls to zero and nothing else breaks. The directory still shows when the page last changed.
- **Turning it off.** Actions, the workflow's "..." menu, Disable workflow stops the refresh and leaves the last version online. Settings, Pages, Unpublish takes it down.
