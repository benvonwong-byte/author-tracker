#!/bin/zsh
# Installs the morning home-connection refresh as a macOS launch agent.
# Runs scripts/home-refresh.sh every day at 5:50 AM local time (a Mac that
# was asleep runs it when it wakes). Remove it with:
#   launchctl bootout gui/$(id -u)/com.dearcrisis.authors-refresh
#   rm ~/Library/LaunchAgents/com.dearcrisis.authors-refresh.plist
#
# Never call launchctl bootout on a target with an empty service name: "gui/501/"
# can end the whole login session. Everything below stops if a name is missing.

set -euo pipefail
LABEL="com.dearcrisis.authors-refresh"
HERE="${0:A:h}"
RUNNER="$HOME/.authors-refresh/home-refresh.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[[ -n "$LABEL" && -n "$RUNNER" && -n "$PLIST" ]] || { echo "missing a name, stopping" >&2; exit 1; }

# The agent runs a copy that lives outside any synced folder.
mkdir -p "${RUNNER:h}"
cp "$HERE/home-refresh.sh" "$RUNNER"
chmod +x "$RUNNER"

cat > "$PLIST" <<PLIST_BODY
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$RUNNER</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>5</integer>
    <key>Minute</key><integer>50</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/tmp/dc-authors-refresh.out.log</string>
  <key>StandardErrorPath</key><string>/tmp/dc-authors-refresh.err.log</string>
</dict>
</plist>
PLIST_BODY

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL: daily at 5:50 AM, runner $RUNNER"
echo "run it now with: launchctl kickstart gui/$(id -u)/$LABEL"
