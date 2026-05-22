import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(join(config.dataDir, "bot.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    cron_expr TEXT NOT NULL,
    prompt TEXT NOT NULL,
    cwd TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    chat_id INTEGER PRIMARY KEY,
    session_id TEXT,
    cwd TEXT NOT NULL,
    voice_mode TEXT NOT NULL DEFAULT 'auto',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`);

// Idempotent migration for existing DBs created before voice_mode existed.
const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
if (!cols.some((c) => c.name === "voice_mode")) {
  db.exec("ALTER TABLE sessions ADD COLUMN voice_mode TEXT NOT NULL DEFAULT 'auto'");
}

export type JobRow = {
  id: number;
  chat_id: number;
  cron_expr: string;
  prompt: string;
  cwd: string | null;
  enabled: number;
  created_at: number;
};

export type VoiceMode = "auto" | "voice" | "text";

export type SessionRow = {
  chat_id: number;
  session_id: string | null;
  cwd: string;
  voice_mode: VoiceMode;
  updated_at: number;
};
