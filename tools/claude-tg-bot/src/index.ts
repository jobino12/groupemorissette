import { Telegraf } from "telegraf";
import { authMiddleware } from "./auth.js";
import { runClaude } from "./claude.js";
import { registerCommands } from "./commands.js";
import { config } from "./config.js";
import { log } from "./logger.js";
import { bootScheduler } from "./scheduler.js";
import { getOrCreateSession } from "./sessions.js";
import { chunkForTelegram } from "./telegram.js";

const bot = new Telegraf(config.telegramToken);

bot.use(authMiddleware);
registerCommands(bot);

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return; // Slash commands handled elsewhere.

  const session = getOrCreateSession(ctx.chat.id);
  const typing = setInterval(() => ctx.sendChatAction("typing").catch(() => {}), 4000);
  ctx.sendChatAction("typing").catch(() => {});

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
    for await (const ev of runClaude(session, text)) {
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
