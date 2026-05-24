#!/usr/bin/env bash
# Create a new isolated bot instance: own token, own database, own launchd service.
# Usage: ./scripts/new-bot.sh <name> <telegram_token> <allowed_user_ids> [default_cwd]
set -euo pipefail

NAME="${1:-}"
TOKEN="${2:-}"
USERS="${3:-}"
CWD="${4:-$HOME/code}"

if [[ -z "$NAME" || -z "$TOKEN" || -z "$USERS" ]]; then
  cat <<USAGE
Usage: $0 <name> <telegram_token> <allowed_user_ids> [default_cwd]

  name              letters/numbers/hyphens only (e.g. research, sales)
  telegram_token    from @BotFather (the new bot's token)
  allowed_user_ids  comma-separated numeric Telegram IDs (usually just yours)
  default_cwd       optional working dir (default: \$HOME/code)

Example:
  $0 research 123456:ABC... 8793973607 ~/code/groupemorissette-ma
USAGE
  exit 1
fi

if ! [[ "$NAME" =~ ^[a-zA-Z0-9-]+$ ]]; then
  echo "Error: name must contain only letters, numbers, and hyphens." >&2
  exit 1
fi

REPO="$HOME/code/claude-tg-bot"
INSTANCE_DIR="$REPO/instances/$NAME"
LABEL="com.sam.claude-bot.$NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
USER_NAME="$(whoami)"
NODE_BIN="$(command -v node)"
UID_NUM="$(id -u)"

if [[ ! -f "$REPO/dist/index.js" ]]; then
  echo "Error: $REPO/dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

if [[ -d "$INSTANCE_DIR" ]]; then
  echo "Error: instance '$NAME' already exists at $INSTANCE_DIR" >&2
  echo "To recreate it, first run: ./scripts/remove-bot.sh $NAME && rm -rf $INSTANCE_DIR" >&2
  exit 1
fi

echo "Creating instance '$NAME'..."
mkdir -p "$INSTANCE_DIR/data"

cat > "$INSTANCE_DIR/.env" <<ENV
TELEGRAM_BOT_TOKEN=$TOKEN
ALLOWED_USER_IDS=$USERS
DEFAULT_CWD=$CWD
CHAT_MODEL=claude-sonnet-4-6
HEAVY_MODEL=claude-opus-4-7
TTS_VOICE_FR=Thomas
TTS_VOICE_EN=Daniel
MAX_5H_TURNS=225
MAX_WEEKLY_TURNS=2000
HARD_STOP_PCT=90
ENV
chmod 600 "$INSTANCE_DIR/.env"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$REPO/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/$USER_NAME</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>NODE_EXTRA_CA_CERTS</key>
    <string>/etc/ssl/cert.pem</string>
    <key>BOT_INSTANCE</key>
    <string>$NAME</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>/Users/$USER_NAME/Library/Logs/claude-bot.$NAME.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/$USER_NAME/Library/Logs/claude-bot.$NAME.err.log</string>
</dict>
</plist>
PLISTEOF

echo "Validating plist..."
plutil -lint "$PLIST"

echo "Starting service..."
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/$LABEL"
launchctl kickstart -k "gui/$UID_NUM/$LABEL"
sleep 3

echo
echo "Done. Instance '$NAME':"
echo "  config:  $INSTANCE_DIR/.env"
echo "  data:    $INSTANCE_DIR/data"
echo "  service: $LABEL"
echo "  logs:    ~/Library/Logs/claude-bot.$NAME.log"
echo
launchctl list | grep "$LABEL" || echo "(not yet in launchctl list — check logs)"
echo
tail -5 "$HOME/Library/Logs/claude-bot.$NAME.log" 2>/dev/null || true
echo
echo "Now message the new bot on Telegram and send /ping."
