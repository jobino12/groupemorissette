import { unlinkSync } from "node:fs";
import type { Telegraf } from "telegraf";
import { config } from "./config.js";
import { db } from "./db.js";
import { log } from "./logger.js";
import { getOrCreateSession } from "./sessions.js";
import { synthesizeSpeech } from "./voice.js";

const MAX_5H = Number(process.env.MAX_5H_TURNS ?? 225);
const MAX_WEEKLY = Number(process.env.MAX_WEEKLY_TURNS ?? 2000);
const HARD_STOP_PCT = Number(process.env.HARD_STOP_PCT ?? 90);
const NOTIF_CHAT_ID = process.env.NOTIFICATIONS_CHAT_ID
  ? Number(process.env.NOTIFICATIONS_CHAT_ID)
  : config.allowedUserIds[0];

const insertTurn = db.prepare(
  "INSERT INTO turns (chat_id, num_turns, cost_usd) VALUES (?, ?, ?)",
);
const sumSince = db.prepare<[number], { total: number }>(
  "SELECT COALESCE(SUM(num_turns), 0) AS total FROM turns WHERE ts >= ?",
);
const getBucket = db.prepare<[string], { last_bucket: number }>(
  "SELECT last_bucket FROM notification_state WHERE window_kind = ?",
);
const setBucket = db.prepare(
  "UPDATE notification_state SET last_bucket = ? WHERE window_kind = ?",
);

let botRef: Telegraf | null = null;

export function initUsage(bot: Telegraf): void {
  botRef = bot;
  log.info({ MAX_5H, MAX_WEEKLY, NOTIF_CHAT_ID }, "usage.init");
}

export type UsageSnapshot = {
  fiveH: { turns: number; cap: number; pct: number };
  weekly: { turns: number; cap: number; pct: number };
};

export function getUsage(): UsageSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const fiveHTurns = sumSince.get(now - 5 * 3600)!.total;
  const weekTurns = sumSince.get(now - 7 * 24 * 3600)!.total;
  return {
    fiveH: {
      turns: fiveHTurns,
      cap: MAX_5H,
      pct: Math.min(100, (fiveHTurns / MAX_5H) * 100),
    },
    weekly: {
      turns: weekTurns,
      cap: MAX_WEEKLY,
      pct: Math.min(100, (weekTurns / MAX_WEEKLY) * 100),
    },
  };
}

function bucketOf(pct: number): number {
  return Math.floor(pct / 10) * 10;
}

export function checkHardLimit(): { blocked: boolean; reason: string } {
  const u = getUsage();
  if (u.fiveH.pct >= HARD_STOP_PCT) {
    return {
      blocked: true,
      reason: `5-hour usage at ${u.fiveH.pct.toFixed(0)}% (guardrail at ${HARD_STOP_PCT}%). Resets within 5h.`,
    };
  }
  if (u.weekly.pct >= HARD_STOP_PCT) {
    return {
      blocked: true,
      reason: `weekly usage at ${u.weekly.pct.toFixed(0)}% (guardrail at ${HARD_STOP_PCT}%). Resets at week boundary.`,
    };
  }
  return { blocked: false, reason: "" };
}

async function notify(text: string): Promise<void> {
  if (!botRef) return;
  const session = getOrCreateSession(NOTIF_CHAT_ID);
  const wantVoice = session.voiceMode === "voice";
  try {
    if (wantVoice) {
      const oga = await synthesizeSpeech(text);
      await botRef.telegram.sendVoice(NOTIF_CHAT_ID, { source: oga });
      try {
        unlinkSync(oga);
      } catch {}
    } else {
      await botRef.telegram.sendMessage(NOTIF_CHAT_ID, text);
    }
  } catch (err) {
    log.error({ err }, "usage.notify_failed");
  }
}

export async function recordTurn(
  chatId: number,
  numTurns = 1,
  costUsd?: number,
): Promise<void> {
  insertTurn.run(chatId, numTurns, costUsd ?? null);
  const u = getUsage();

  const windows: Array<{ key: "5h" | "weekly"; pct: number; turns: number; cap: number; label: string }> = [
    { key: "5h", pct: u.fiveH.pct, turns: u.fiveH.turns, cap: u.fiveH.cap, label: "5-hour session" },
    { key: "weekly", pct: u.weekly.pct, turns: u.weekly.turns, cap: u.weekly.cap, label: "weekly" },
  ];

  for (const w of windows) {
    const last = getBucket.get(w.key)?.last_bucket ?? 0;
    const cur = bucketOf(w.pct);
    if (cur > last && cur > 0) {
      await notify(
        `📊 ${cur}% of ${w.label} Claude usage reached — ${w.turns}/${w.cap} turns.`,
      );
      setBucket.run(cur, w.key);
    } else if (cur < last) {
      setBucket.run(cur, w.key);
    }
  }
}

export function formatUsage(u: UsageSnapshot): string {
  const bar = (pct: number) => {
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };
  return [
    `5-hour:  ${bar(u.fiveH.pct)}  ${u.fiveH.pct.toFixed(0)}%  (${u.fiveH.turns}/${u.fiveH.cap} turns)`,
    `Weekly:  ${bar(u.weekly.pct)}  ${u.weekly.pct.toFixed(0)}%  (${u.weekly.turns}/${u.weekly.cap} turns)`,
  ].join("\n");
}
