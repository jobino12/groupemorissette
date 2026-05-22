# Bootstrap on your home iMac (one-time, ~20 min mostly waiting)

> Run every step on the home Mac. The work computer / phone is only used for messaging the bot once it's up.

## 0. Prereqs

- macOS account with admin rights (you).
- An active Claude Max subscription.
- A Telegram account on your phone.

## 1. Install Homebrew (skip if already installed)

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After it finishes, follow the on-screen instructions to add `brew` to your PATH (usually appending two lines to `~/.zprofile`).

## 2. Install runtime + tools

```sh
brew install node@20 tailscale
brew link --overwrite node@20
npm install -g @anthropic-ai/claude-code
which node    # confirm something like /usr/local/bin/node on Intel, /opt/homebrew/bin/node on Apple Silicon
which claude  # should print the claude binary location
```

> Your iMac is Intel, so node will be at `/usr/local/bin/node` — that's what the bundled launchd plist assumes.

## 3. Log into Claude with your Max account

```sh
claude login
```

A browser tab opens. Sign in with the email tied to your Max plan. This stores OAuth creds in `~/.claude/`. **Do not** set `ANTHROPIC_API_KEY` anywhere — that would route to the metered API instead of your subscription.

Quick test:

```sh
claude -p "say hi"
```

## 4. Start Tailscale (escape hatch only, the bot doesn't need it)

```sh
sudo tailscale up
```

Sign in. On your phone, install the Tailscale app from the App Store and sign in with the same account. Verify with:

```sh
tailscale status
```

You should see your phone listed. Now you can `ssh sam@<imac-name>.<tailnet>.ts.net` from the phone if the bot ever wedges.

## 5. Create the Telegram bot

1. On your phone, message `@BotFather` on Telegram.
2. Send `/newbot`. Give it a name (e.g. "Sam's Home Claude") and a username ending in `bot` (e.g. `sam_home_claude_bot`).
3. Copy the **HTTP API token** BotFather sends you — it looks like `123456789:ABCdef...`. Keep it private.
4. Message `@userinfobot`, send `/start`, copy your numeric **user ID** (e.g. `987654321`).

## 6. Move the scaffold out of `groupemorissette` into its own repo

This scaffold currently lives inside the `groupemorissette` repo at `tools/claude-tg-bot/` because the Claude Code session that built it was scoped to that repo. Lift it out to its own home:

```sh
mkdir -p ~/code
cp -R /path/to/groupemorissette/tools/claude-tg-bot ~/code/claude-tg-bot
cd ~/code/claude-tg-bot
git init
git add .
git commit -m "Initial scaffold from claude-tg-bot"
```

Then create a fresh private GitHub repo:

- Either via the web UI at https://github.com/new (name: `claude-tg-bot`, private), then:
  ```sh
  git remote add origin git@github.com:jobino12/claude-tg-bot.git
  git branch -M main
  git push -u origin main
  ```
- Or with the `gh` CLI:
  ```sh
  brew install gh && gh auth login
  gh repo create jobino12/claude-tg-bot --private --source=. --push
  ```

## 7. Configure

```sh
cd ~/code/claude-tg-bot
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdef...        # from BotFather
ALLOWED_USER_IDS=987654321                     # your Telegram user ID
DEFAULT_CWD=/Users/sam/code                    # replace `sam` with your username
```

## 8. Build

```sh
npm install
npm run build
```

Smoke-test (Ctrl-C to stop):

```sh
node dist/index.js
```

On your phone, open the bot's chat (link is in the BotFather reply) and send `/ping`. You should get `pong`. Send any other message and you should get a Claude reply.

## 9. Install the launchd job

Edit `launchd/com.sam.claude-tg-bot.plist`, replacing every `__USER__` with your macOS short username (`whoami` output). If `which node` printed something other than `/usr/local/bin/node`, update the ProgramArguments path too.

Install:

```sh
cp launchd/com.sam.claude-tg-bot.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sam.claude-tg-bot.plist
launchctl enable gui/$(id -u)/com.sam.claude-tg-bot
```

Verify it's running:

```sh
launchctl print gui/$(id -u)/com.sam.claude-tg-bot | head -20
tail -f ~/Library/Logs/claude-tg-bot.log
```

Send `/ping` from your phone again — you should still get `pong`.

To reload after code changes:

```sh
cd ~/code/claude-tg-bot && git pull && npm install && npm run build
launchctl kickstart -k gui/$(id -u)/com.sam.claude-tg-bot
```

To uninstall:

```sh
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.sam.claude-tg-bot.plist
rm ~/Library/LaunchAgents/com.sam.claude-tg-bot.plist
```

## 10. Stop the Mac from sleeping

System Settings → Battery / Energy Saver:

- **Prevent automatic sleeping when the display is off**: ON
- **Start up automatically after a power failure**: ON
- **Wake for network access**: ON

If you want bulletproofing, also: `sudo pmset -a sleep 0 disksleep 0 displaysleep 30 powernap 0`.

## 11. End-to-end verification

- [ ] `/ping` from phone → "pong"
- [ ] From `web.telegram.org` on work laptop → same bot replies
- [ ] "what's in ~/code?" → Claude runs `ls` and replies with your repos
- [ ] Multi-turn: "open groupemorissette" → "what does it do?" — second message remembers the first
- [ ] `/schedule */2 * * * * | say hi` → "hi" every 2 minutes; then `/cancel <id>`
- [ ] `sudo killall -9 node` → launchd restarts within seconds; bot answers `/ping` again
- [ ] Reboot iMac → log back in → bot online without intervention
- [ ] From a different (non-allowlisted) Telegram account → bot silent
- [ ] `ssh sam@<imac>.<tailnet>.ts.net` from phone → terminal works

## Troubleshooting

- **Bot doesn't respond after install**: check `~/Library/Logs/claude-tg-bot.err.log`. Most common cause: `claude` not on PATH for the launchd job. Confirm `/usr/local/bin` (or `/opt/homebrew/bin`) is in the plist's `EnvironmentVariables → PATH`.
- **`401 Unauthorized` from Telegram**: token is wrong or has whitespace.
- **`Missing required env var`**: `.env` not found. The plist sets `WorkingDirectory`, and `dotenv` reads from CWD — make sure that path is correct.
- **Claude prompts for auth**: `claude login` wasn't run as the same user that owns the launchd job, or `HOME` isn't set in the plist. Both are set in the bundled plist.
- **Two bots responding**: another instance is still running (`pgrep -f claude-tg-bot`). Kill it.
