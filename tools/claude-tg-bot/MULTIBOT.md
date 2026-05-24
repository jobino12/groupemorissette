# Running multiple bots

Each bot is an isolated **instance**: its own Telegram token, database, inbox/outbox,
and launchd service. They share one codebase but never touch each other's data, so
creating or removing one can't break the others.

- **Legacy bot**: the original bot (root `.env`, `data/`, service `com.sam.claude-tg-bot`)
  keeps running as-is. You don't have to migrate it.
- **New bots**: live in `instances/<name>/`, service `com.sam.claude-bot.<name>`.

## Create a bot

1. Make a new bot in Telegram via `@BotFather` (`/newbot`) and copy its token.
2. On the iMac:

```sh
cd ~/code/claude-tg-bot
./scripts/new-bot.sh <name> <token> <your_user_id> [default_cwd]
```

Example:

```sh
./scripts/new-bot.sh research 123456:ABC... 8793973607 ~/code/groupemorissette-ma
```

That scaffolds the instance, writes its `.env`, generates + starts the launchd
service, and tails the log. Then message the new bot and `/ping`.

## List bots

```sh
./scripts/list-bots.sh
```

## Remove a bot

```sh
./scripts/remove-bot.sh <name>     # stops + unregisters; data preserved
rm -rf instances/<name>            # only if you also want to delete its data
```

## Update code for all bots

Edit/rebuild once; every instance uses the shared `dist/`:

```sh
git pull && npm run build
# restart each instance:
launchctl kickstart -k gui/$(id -u)/com.sam.claude-bot.<name>
```

## Notes

- Each bot needs a **different** Telegram token. Two services on the same token
  collide and crash — that's what broke things before.
- Each instance has its own SQLite DB, so schema/sessions never clash.
- Config knobs (models, voices, usage caps) live in each instance's `.env`.
