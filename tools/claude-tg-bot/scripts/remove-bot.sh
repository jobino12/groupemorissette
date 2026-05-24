#!/usr/bin/env bash
# Stop and unregister a bot instance's launchd service. Data is preserved.
# Usage: ./scripts/remove-bot.sh <name>
set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <name>" >&2
  exit 1
fi

LABEL="com.sam.claude-bot.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"
INSTANCE_DIR="$HOME/code/claude-tg-bot/instances/$NAME"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
rm -f "$PLIST"

echo "Stopped and unregistered '$NAME'."
echo "Instance data is PRESERVED at: $INSTANCE_DIR"
echo "To delete it permanently: rm -rf \"$INSTANCE_DIR\""
