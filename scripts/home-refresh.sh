#!/bin/zsh
# Reads every feed from a home connection and pushes the dates.
#
# Eventbrite and a few venue sites refuse GitHub's servers. This script runs
# on a Mac each morning, before GitHub's own build, and pushes data/events.json.
# The push redeploys the site, and GitHub's run reuses these results for any
# source that blocks it (see "last good read" in scripts/fetch-events.mjs).
#
# It works in its own clone, so it never touches anyone's working copy.
# Install: scripts/install-home-refresh.sh. Logs: /tmp/dc-authors-refresh.*.log

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

CLONE="${AUTHORS_CLONE:-$HOME/.authors-refresh/author-tracker}"
REPO_URL="https://github.com/benvonwong-byte/author-tracker.git"
DATA=(data/events.json data/seen.json data/pages.json data/name-search.json)
# Turns on the daily Eventbrite search by author name, which GitHub cannot do.
export AUTHORS_HOME=1

echo "$(date '+%F %T') authors refresh: start"

if [[ ! -d "$CLONE/.git" ]]; then
  mkdir -p "${CLONE:h}"
  git clone -q "$REPO_URL" "$CLONE"
fi
cd "$CLONE"
git fetch -q origin main
git reset -q --hard origin/main

node scripts/fetch-events.mjs

# Commit only the data files, on top of whatever main is now, so a script
# change pushed while the fetch ran is never undone. Two tries in case
# GitHub's own run pushes in between.
for attempt in 1 2; do
  git fetch -q origin main
  git reset -q --mixed origin/main
  git add "${DATA[@]}"
  if git diff --cached --quiet; then
    echo "$(date '+%F %T') authors refresh: nothing changed"
    exit 0
  fi
  git commit -q -m "data: dates read from a home connection, $(date +%F)"
  if git push -q origin HEAD:main; then
    echo "$(date '+%F %T') authors refresh: pushed $(git rev-parse --short HEAD)"
    exit 0
  fi
  echo "$(date '+%F %T') authors refresh: push rejected, retrying"
done
echo "$(date '+%F %T') authors refresh: gave up after two pushes" >&2
exit 1
