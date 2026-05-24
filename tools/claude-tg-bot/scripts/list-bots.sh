#!/usr/bin/env bash
# Show all bot instances and their running status.
set -euo pipefail

REPO="$HOME/code/claude-tg-bot"

echo "=== Configured instances ==="
if [[ -d "$REPO/instances" ]] && [[ -n "$(ls -A "$REPO/instances" 2>/dev/null)" ]]; then
  for d in "$REPO/instances"/*/; do
    name="$(basename "$d")"
    echo "  - $name"
  done
else
  echo "  (none — only the legacy root bot, if any)"
fi

echo
echo "=== Running launchd services ==="
launchctl list | grep -E "claude-bot\.|claude-tg-bot" || echo "  (none running)"

echo
echo "Legend: PID  EXIT  LABEL   (EXIT 0 = healthy, negative = killed by signal, positive = crashed)"
