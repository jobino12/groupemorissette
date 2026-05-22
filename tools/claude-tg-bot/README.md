# claude-tg-bot

A Telegram bot that drives a persistent Claude Code session on a home Mac, with cron-style and on-demand scheduling. Auth via Telegram user-ID allowlist. Uses your Claude Max subscription via `claude login` — no API key, no per-token billing.

## How it works

- Telegraf long-polls Telegram (outbound only, no port forwarding).
- Each Telegram chat maps to a persistent Claude Code session via `@anthropic-ai/claude-agent-sdk`. Session IDs are stored in SQLite and resumed on every turn.
- A scheduler (`node-cron` + SQLite) lets you create recurring prompts from chat: `/schedule 0 9 * * 1-5 | summarize overnight CI`.
- A launchd plist keeps the daemon alive across reboots.

## Files

- `src/index.ts` — entry; wires Telegraf, scheduler, message handler
- `src/auth.ts` — allowlist middleware
- `src/sessions.ts` — chat → Claude session ID + cwd, persisted in SQLite
- `src/claude.ts` — Agent SDK wrapper that yields typed events (text, tool, done, error)
- `src/scheduler.ts` — node-cron jobs persisted in SQLite
- `src/commands.ts` — `/ping`, `/reset`, `/cd`, `/pwd`, `/schedule`, `/jobs`, `/cancel`
- `src/telegram.ts` — 4000-char chunking
- `src/db.ts` — SQLite (better-sqlite3) schema + handle
- `src/config.ts` — env loading
- `launchd/com.sam.claude-tg-bot.plist` — macOS launchd job

## Setup

See `BOOTSTRAP.md` for the one-time installation steps on the home Mac.

## Daily use

Once installed, just message your bot on Telegram from anywhere — phone, desktop app, `web.telegram.org` from a work browser. Sessions persist; type `/reset` to start fresh.
