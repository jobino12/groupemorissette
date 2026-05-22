import { config } from "./config.js";
import { db, type SessionRow } from "./db.js";

const getStmt = db.prepare<[number], SessionRow>("SELECT * FROM sessions WHERE chat_id = ?");
const upsertStmt = db.prepare(`
  INSERT INTO sessions (chat_id, session_id, cwd, updated_at)
  VALUES (?, ?, ?, strftime('%s','now'))
  ON CONFLICT(chat_id) DO UPDATE SET
    session_id = excluded.session_id,
    cwd = excluded.cwd,
    updated_at = excluded.updated_at
`);
const clearSessionIdStmt = db.prepare(
  "UPDATE sessions SET session_id = NULL, updated_at = strftime('%s','now') WHERE chat_id = ?",
);

export type ChatSession = { chatId: number; sessionId: string | null; cwd: string };

export function getOrCreateSession(chatId: number): ChatSession {
  const row = getStmt.get(chatId);
  if (row) return { chatId, sessionId: row.session_id, cwd: row.cwd };
  upsertStmt.run(chatId, null, config.defaultCwd);
  return { chatId, sessionId: null, cwd: config.defaultCwd };
}

export function setSessionId(chatId: number, sessionId: string): void {
  const existing = getOrCreateSession(chatId);
  upsertStmt.run(chatId, sessionId, existing.cwd);
}

export function setCwd(chatId: number, cwd: string): void {
  const existing = getOrCreateSession(chatId);
  upsertStmt.run(chatId, existing.sessionId, cwd);
}

export function resetSession(chatId: number): void {
  clearSessionIdStmt.run(chatId);
}
