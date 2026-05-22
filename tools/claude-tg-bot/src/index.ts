import { Context, Telegraf } from "telegraf";
import { authMiddleware } from "./auth.js";
import { runClaude } from "./claude.js";
import { registerCommands } from "./commands.js";
import { config } from "./config.js";
import {
  buildContextPrefix,
  collectOutboxFilesSince,
  deliverOutboxFiles,
  downloadTelegramFile,
} from "./files.js";
import { log } from "./logger.js";
import { bootScheduler } from "./scheduler.js";
import { getOrCreateSession } from "./sessions.js";
import { chunkForTelegram } from "./telegram.js";

const bot = new Telegraf(config.telegramToken);

bot.use(authMiddleware);
registerCommands(bot);

async function runTurn(
  ctx: Context,
  userText: string,
  attachedPaths: string[] = [],
): Promise<void> {
  if (!ctx.chat) return;
  const session = getOrCreateSession(ctx.chat.id);
  const typing = setInterval(() => ctx.sendChatAction("typing").catch(() => {}), 4000);
  ctx.sendChatAction("typing").catch(() => {});
  const turnStart = Date.now();

  let buf = "";
  const flush = async (force = false) => {
    if (!buf) return;
    if (!force && buf.length < 3500) return;
    const out = buf;
    buf = "";
    for (const chunk of chunkForTelegram(out)) {
      await ctx.reply(chunk).catch((err) => log.error({ err }, "telegram.send_failed"));
    }
  };

  try {
    const prefix = buildContextPrefix(ctx.chat.id, attachedPaths);
    for await (const ev of runClaude(session, userText, prefix)) {
      if (ev.kind === "text") {
        buf += ev.text;
        await flush(false);
      } else if (ev.kind === "tool") {
        await flush(true);
        await ctx.reply(`→ ${ev.name} ${ev.brief}`).catch(() => {});
      } else if (ev.kind === "error") {
        await flush(true);
        await ctx.reply(`⚠️ ${ev.message}`).catch(() => {});
      } else if (ev.kind === "session") {
        log.info({ chatId: ctx.chat.id, sessionId: ev.sessionId }, "session.new");
      } else if (ev.kind === "done") {
        await flush(true);
        if (ev.costUsd != null) {
          log.info(
            { chatId: ctx.chat.id, costUsd: ev.costUsd, durationMs: ev.durationMs, numTurns: ev.numTurns },
            "claude.done",
          );
        }
      }
    }
  } catch (err) {
    log.error({ err, chatId: ctx.chat.id }, "handler.error");
    await ctx.reply(`Internal error: ${err instanceof Error ? err.message : err}`).catch(() => {});
  } finally {
    clearInterval(typing);
    const newFiles = collectOutboxFilesSince(ctx.chat.id, turnStart);
    if (newFiles.length) await deliverOutboxFiles(bot, ctx.chat.id, newFiles);
  }
}

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;
  await runTurn(ctx, text);
});

bot.on("document", async (ctx) => {
  const doc = ctx.message.document;
  const caption = ctx.message.caption ?? "";
  try {
    const localPath = await downloadTelegramFile(bot, doc.file_id, ctx.chat.id, doc.file_name ?? doc.file_id);
    const prompt = caption || `I just sent you a file. Note its location for now; I'll tell you what to do with it.`;
    await runTurn(ctx, prompt, [localPath]);
  } catch (err) {
    log.error({ err }, "document.handler_failed");
    await ctx.reply(`Could not save file: ${err instanceof Error ? err.message : err}`);
  }
});

bot.on("photo", async (ctx) => {
  const photos = ctx.message.photo;
  const largest = photos[photos.length - 1];
  const caption = ctx.message.caption ?? "";
  try {
    const localPath = await downloadTelegramFile(bot, largest.file_id, ctx.chat.id, `${largest.file_unique_id}.jpg`);
    const prompt = caption || `I just sent you a photo. Note its location for now; I'll tell you what to do with it.`;
    await runTurn(ctx, prompt, [localPath]);
  } catch (err) {
    log.error({ err }, "photo.handler_failed");
    await ctx.reply(`Could not save photo: ${err instanceof Error ? err.message : err}`);
  }
});

bot.catch((err) => {
  log.error({ err }, "telegraf.error");
});

async function main() {
  bootScheduler(bot);
  await bot.launch({ dropPendingUpdates: true });
  log.info("bot.started");
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

main().catch((err) => {
  log.error({ err }, "bot.fatal");
  process.exit(1);
});
