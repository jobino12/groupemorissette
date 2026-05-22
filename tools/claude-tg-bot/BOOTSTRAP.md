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
brew install node@20 tailscale python@3.12
brew link --overwrite node@20
npm install -g @anthropic-ai/claude-code
which node    # confirm something like /usr/local/bin/node on Intel, /opt/homebrew/bin/node on Apple Silicon
which claude  # should print the claude binary location
```

> Your iMac is Intel, so node will be at `/usr/local/bin/node` — that's what the bundled launchd plist assumes.

### Voice (free, local)

Speech-to-text via whisper.cpp, text-to-speech via macOS `say` (Canadian French
voice "Amélie"). All local, zero per-message cost.

```sh
brew install whisper-cpp ffmpeg

# Download the French-capable small model (~250MB).
# Lives wherever DATA_DIR points; default is ./data/models.
mkdir -p ~/code/claude-tg-bot/data/models
curl -L -o ~/code/claude-tg-bot/data/models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

# Confirm the binaries are reachable.
which whisper-cli ffmpeg
say -v Amelie "Bonjour, je suis prête."   # you should hear Amélie speak
```

Notes:
- Transcription on a 2015 iMac takes roughly 0.5–1× the audio length with the
  `small` model (handles French + English fine via `-l auto`). A 30-second
  voice note → ~30s of CPU work. Upgrade to `ggml-medium.bin` (~1.5GB) if you
  want better accuracy and don't mind ~2× slower; same URL pattern.

#### Bilingual male voice ("Steve")

Whisper auto-detects the language going in. For replies, the bot picks a voice
per reply based on what language Claude responded in — French gets
`TTS_VOICE_FR`, English gets `TTS_VOICE_EN`. Defaults are male voices that
ship with macOS:

| Lang | Default | Quality | Alternatives |
|------|---------|---------|--------------|
| French | **Thomas** (fr-FR) | Built-in, decent | **Felix** (fr-CA, Premium download) for Quebec accent |
| English | **Daniel** (en-GB) | Built-in, decent | **Steve** (en-US, Premium), **Aaron** / **Tom** (en-US, built-in) |

To preview voices:

```sh
say -v Thomas "Bonjour, je suis Steve."
say -v Daniel "Hello, I'm Steve."
say -v ?     # list every installed voice
```

To install Premium voices (for higher quality or fr-CA male):

1. System Settings → **Accessibility** → **Spoken Content**
2. **System Voice** → **Manage Voices…**
3. Tick the boxes for *Felix (French — Canada)* and *Steve (English — United States)*. ~100MB each.
4. Once downloaded, set in `.env`:
   ```
   TTS_VOICE_FR=Felix
   TTS_VOICE_EN=Steve
   ```
5. Restart the bot: `launchctl kickstart -k gui/$(id -u)/com.sam.claude-tg-bot`

### Scraping + modeling toolkit (for the M&A use case)

Install once so Claude has these ready when you ask for scrapes, models, decks:

```sh
# Headless browser (Playwright) — for REQ, RBQ, Reprenariat Québec, generic web scrapes
npm install -g playwright
playwright install chromium

# Python toolkit for models and decks
python3 -m pip install --user --upgrade pip
python3 -m pip install --user pandas openpyxl python-pptx beautifulsoup4 lxml requests rich
```

You don't need to know how to use any of these — Claude will reach for them on its own when you ask it to "scrape", "build a model", or "make a teaser deck".

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

## 10b. Wire up the M&A project context

```sh
mkdir -p ~/code/groupemorissette-ma
cp ~/code/claude-tg-bot/docs/groupemorissette-ma-CLAUDE.md ~/code/groupemorissette-ma/CLAUDE.md
# Open the file, fill in the TODOs (criteria, geography, deal-size band, etc.)
cd ~/code/groupemorissette-ma && git init && git add . && git commit -m "Initial M&A context"
```

Then from your Telegram bot, point a new chat at it:

```
/cd ~/code/groupemorissette-ma
```

From this point on, every Claude session in that chat reads `CLAUDE.md`
automatically — no need to re-explain the project.

## 10c. Seed your first scheduled jobs

Open the bot in Telegram and run these once. Adjust the cron expressions and
prompts to your taste — `/jobs` lists them, `/cancel <id>` removes one.

```
/cd ~/code/groupemorissette-ma
```

```
/schedule 0 8 * * 1 | Weekly source scan. Check Reprenariat Québec (login with REPRENARIAT_QC_EMAIL / REPRENARIAT_QC_PASSWORD via Playwright), REQ new incorporations in our target industries this week, and RBQ licensee changes. Save raw snapshots to data/snapshots/, diff against last week, and post the top 5 most promising new leads with source links + 5-line qualification each. Append qualified leads to pipeline/targets.csv.
```

```
/schedule 0 16 * * 5 | Friday pipeline summary. Read pipeline/targets.csv and produce: (1) counts by status, (2) the 3 most interesting active targets and what the next step is for each, (3) anything aging > 30 days with no activity. Save a Markdown summary to outbox as `weekly-pipeline-<YYYY-MM-DD>.md` and message me the highlights.
```

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
