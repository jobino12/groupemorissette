import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import type { Telegraf } from "telegraf";
import { config } from "./config.js";
import { log } from "./logger.js";

const INBOX_ROOT = join(config.dataDir, "inbox");
const OUTBOX_ROOT = join(config.dataDir, "outbox");

mkdirSync(INBOX_ROOT, { recursive: true });
mkdirSync(OUTBOX_ROOT, { recursive: true });

export function inboxDir(chatId: number): string {
  const dir = join(INBOX_ROOT, String(chatId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function outboxDir(chatId: number): string {
  const dir = join(OUTBOX_ROOT, String(chatId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

export async function downloadTelegramFile(
  bot: Telegraf,
  fileId: string,
  chatId: number,
  preferredName: string,
): Promise<string> {
  const link = await bot.telegram.getFileLink(fileId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(inboxDir(chatId), `${stamp}-${sanitize(preferredName)}`);
  const res = await fetch(link.toString());
  if (!res.ok || !res.body) throw new Error(`Telegram file fetch failed: ${res.status}`);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(target));
  log.info({ chatId, target }, "files.inbound");
  return target;
}

export function collectOutboxFilesSince(chatId: number, sinceMs: number): string[] {
  const dir = outboxDir(chatId);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(dir, entry.name);
    const st = statSync(path);
    if (st.mtimeMs > sinceMs) out.push(path);
  }
  return out.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

export async function deliverOutboxFiles(
  bot: Telegraf,
  chatId: number,
  paths: string[],
): Promise<void> {
  for (const path of paths) {
    try {
      await bot.telegram.sendDocument(chatId, { source: path, filename: basename(path) });
      log.info({ chatId, path }, "files.outbound");
    } catch (err) {
      log.error({ err, chatId, path }, "files.outbound_failed");
      await bot.telegram
        .sendMessage(chatId, `⚠️ Could not deliver ${basename(path)}: ${err instanceof Error ? err.message : err}`)
        .catch(() => {});
    }
  }
}

export function buildContextPrefix(
  chatId: number,
  attachedInboxPaths: string[] = [],
): string {
  const lines = [
    `[Bot context — do not echo back]`,
    `Your outbox for this chat is: ${outboxDir(chatId)}`,
    `Anything you save there during this turn is delivered to me as a Telegram document.`,
    `Use absolute paths when saving files there.`,
  ];
  if (attachedInboxPaths.length) {
    lines.push("", "I just attached the following file(s) — they are saved at:");
    for (const p of attachedInboxPaths) lines.push(`- ${p}`);
  }
  lines.push("", "---", "");
  return lines.join("\n");
}
