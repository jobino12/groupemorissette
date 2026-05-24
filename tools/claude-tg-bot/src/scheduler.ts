import cron from "node-cron";
import { Telegraf } from "telegraf";
import { config } from "./config.js";
import { db, type JobRow } from "./db.js";
import {
  buildContextPrefix,
  collectOutboxFilesSince,
  deliverOutboxFiles,
} from "./files.js";
import { log } from "./logger.js";
import { runClaude } from "./claude.js";
import { getOrCreateSession } from "./sessions.js";
import { chunkForTelegram } from "./telegram.js";
import { checkHardLimit, recordTurn } from "./usage.js";

const tasks = new Map<number, cron.ScheduledTask>();

const listEnabledStmt = db.prepare<[], JobRow>("SELECT * FROM jobs WHERE enabled = 1");
const listAllStmt = db.prepare<[number], JobRow>("SELECT * FROM jobs WHERE chat_id = ? ORDER BY id");
const insertStmt = db.prepare(
  "INSERT INTO jobs (chat_id, cron_expr, prompt, cwd) VALUES (?, ?, ?, ?)",
);
const deleteStmt = db.prepare("DELETE FROM jobs WHERE id = ? AND chat_id = ?");
const getStmt = db.prepare<[number], JobRow>("SELECT * FROM jobs WHERE id = ?");

function scheduleOne(bot: Telegraf, job: JobRow): void {
  if (!cron.validate(job.cron_expr)) {
    log.warn({ jobId: job.id, cron_expr: job.cron_expr }, "scheduler.invalid_cron_expr");
    return;
  }
  const task = cron.schedule(job.cron_expr, async () => {
    log.info({ jobId: job.id, chatId: job.chat_id }, "scheduler.fire");
    const limit = checkHardLimit();
    if (limit.blocked) {
      log.warn({ jobId: job.id, reason: limit.reason }, "scheduler.skipped_usage_guardrail");
      await bot.telegram
        .sendMessage(job.chat_id, `⏰ Job #${job.id} skipped — usage guardrail: ${limit.reason}`)
        .catch(() => {});
      return;
    }
    const session = getOrCreateSession(job.chat_id);
    if (job.cwd) session.cwd = job.cwd;
    const turnStart = Date.now();
    let buf = "";
    let doneCost: number | undefined;
    let doneTurns = 1;
    try {
      const prefix = buildContextPrefix(job.chat_id, session.cwd);
      for await (const ev of runClaude(session, job.prompt, {
        contextPrefix: prefix,
        model: config.heavyModel,
      })) {
        if (ev.kind === "text") buf += ev.text;
        else if (ev.kind === "error") buf += `\n\n[error] ${ev.message}`;
        else if (ev.kind === "done") {
          doneCost = ev.costUsd;
          doneTurns = ev.numTurns ?? 1;
        }
      }
      const header = `⏰ Job #${job.id} — \`${job.cron_expr}\`\n\n`;
      const body = (buf.trim() || "(no output)").trim();
      for (const chunk of chunkForTelegram(header + body)) {
        await bot.telegram.sendMessage(job.chat_id, chunk);
      }
      const newFiles = collectOutboxFilesSince(job.chat_id, turnStart);
      if (newFiles.length) await deliverOutboxFiles(bot, job.chat_id, newFiles);
      await recordTurn(job.chat_id, doneTurns, doneCost);
    } catch (err) {
      log.error({ err, jobId: job.id }, "scheduler.job_failed");
      await bot.telegram
        .sendMessage(job.chat_id, `⏰ Job #${job.id} failed: ${err instanceof Error ? err.message : err}`)
        .catch(() => {});
    }
  });
  tasks.set(job.id, task);
}

export function bootScheduler(bot: Telegraf): void {
  const jobs = listEnabledStmt.all();
  for (const job of jobs) scheduleOne(bot, job);
  log.info({ count: jobs.length }, "scheduler.boot");
}

export function addJob(
  bot: Telegraf,
  chatId: number,
  cronExpr: string,
  prompt: string,
  cwd: string | null,
): JobRow {
  if (!cron.validate(cronExpr)) throw new Error(`Invalid cron expression: ${cronExpr}`);
  const info = insertStmt.run(chatId, cronExpr, prompt, cwd);
  const job = getStmt.get(Number(info.lastInsertRowid))!;
  scheduleOne(bot, job);
  return job;
}

export function listJobs(chatId: number): JobRow[] {
  return listAllStmt.all(chatId);
}

export function cancelJob(chatId: number, id: number): boolean {
  const task = tasks.get(id);
  if (task) {
    task.stop();
    tasks.delete(id);
  }
  const info = deleteStmt.run(id, chatId);
  return info.changes > 0;
}

