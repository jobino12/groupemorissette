import { unlinkSync } from "node:fs";
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
import { initUsage, recordTurn } from "./usage.js";
import { detectLang, splitForTts, synthesizeSpeech, transcribeVoice } from "./voice.js";

const bot = new Telegraf(config.telegramToken);

bot.use(authMiddleware);
registerCommands(bot);

async function replyWithVoice(ctx: Context, text: string): Promise<void> {
  if (!ctx.chat) return;
  const replyLang = detectLang(text);
  for (const part of splitForTts(text)) {
    if (!part.trim()) continue;
    try {
      const ogaPath = await synthesizeSpeech(part, replyLang);
      await ctx.replyWithVoice({ source: ogaPath });
      try {
        unlinkSync(ogaPath);
      } catch {}
    } catch (err) {
      log.error({ err }, "voice.synth_failed");
      await ctx.reply(part).catch(() => {});
    }
  }
}

async function runTurn(
  ctx: Context,
  userText: string,
  opts: { attachedPaths?: string[]; replyAsVoice?: boolean } = {},
): Promise<void> {
  if (!ctx.chat) return;
  const session = getOrCreateSession(ctx.chat.id);
  const replyAsVoice =
    opts.replyAsVoice ?? (session.voiceMode === "voice");
  const typing = setInterval(
    () => ctx.sendChatAction(replyAsVoice ? "record_voice" : "typing").catch(() => {}),
    4000,
  );
  ctx.sendChatAction(replyAsVoice ? "record_voice" : "typing").catch(() => {});
  const turnStart = Date.now();

  let buf = "";
  const flushText = async (force = false) => {
    if (!buf) return;
    if (!force && buf.length < 3500) return;
    const out = buf;
    buf = "";
    for (const chunk of chunkForTelegram(out)) {
      await ctx.reply(chunk).catch((err) => log.error({ err }, "telegram.send_failed"));
    }
  };

  try {
    const basePrefix = buildContextPrefix(ctx.chat.id, opts.attachedPaths ?? []);
    const voiceConcise = replyAsVoice
      ? "[This reply will be spoken aloud via TTS. Be conversational and concise — under 3 short sentences unless I explicitly asked for detail. No code blocks, no lists, no markdown.]\n\n"
      : "";
    const prefix = basePrefix + voiceConcise;
    for await (const ev of runClaude(session, userText, {
      contextPrefix: prefix,
      model: config.chatModel,
    })) {
      if (ev.kind === "text") {
        buf += ev.text;
        if (!replyAsVoice) await flushText(false);
      } else if (ev.kind === "tool") {
        if (!replyAsVoice) {
          await flushText(true);
          await ctx.reply(`→ ${ev.name} ${ev.brief}`).catch(() => {});
        }
      } else if (ev.kind === "error") {
        if (!replyAsVoice) await flushText(true);
        await ctx.reply(`⚠️ ${ev.message}`).catch(() => {});
      } else if (ev.kind === "session") {
        log.info({ chatId: ctx.chat.id, sessionId: ev.sessionId }, "session.new");
      } else if (ev.kind === "done") {
        if (replyAsVoice) {
          const finalText = buf.trim();
          buf = "";
          if (finalText) await replyWithVoice(ctx, finalText);
        } else {
          await flushText(true);
        }
        if (ev.costUsd != null) {
          log.info(
            { chatId: ctx.chat.id, costUsd: ev.costUsd, durationMs: ev.durationMs, numTurns: ev.numTurns },
            "claude.done",
          );
        }
        await recordTurn(ctx.chat.id, ev.numTurns ?? 1, ev.costUsd);
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

bot.command("opus", async (ctx) => {
  const text = ctx.message.text;
  const space = text.indexOf(" ");
  const prompt = space === -1 ? "" : text.slice(space + 1).trim();
  if (!prompt) {
    return ctx.reply("Usage: /opus <prompt>\nRuns the prompt against the heavy model (Opus) in an isolated session — won't touch your current chat session. Result arrives when ready.");
  }
  await ctx.reply(`🧠 On it with Opus. I'll keep chatting normally; the result will arrive here when done.`);
  void runOpusBackground(ctx, prompt);
});

async function runOpusBackground(ctx: Context, prompt: string): Promise<void> {
  if (!ctx.chat) return;
  const chatId = ctx.chat.id;
  const session = getOrCreateSession(chatId);
  const turnStart = Date.now();
  let buf = "";
  try {
    const prefix = buildContextPrefix(chatId);
    for await (const ev of runClaude(session, prompt, {
      contextPrefix: prefix,
      model: config.heavyModel,
      isolatedSession: true,
    })) {
      if (ev.kind === "text") buf += ev.text;
      else if (ev.kind === "tool") {
        await bot.telegram.sendMessage(chatId, `→ ${ev.name} ${ev.brief}`).catch(() => {});
      } else if (ev.kind === "error") {
        await bot.telegram.sendMessage(chatId, `⚠️ ${ev.message}`).catch(() => {});
      } else if (ev.kind === "done") {
        const finalText = buf.trim() || "(no output)";
        const header = "🧠 Opus result:\n\n";
        for (const chunk of chunkForTelegram(header + finalText)) {
          await bot.telegram.sendMessage(chatId, chunk).catch(() => {});
        }
        await recordTurn(chatId, ev.numTurns ?? 1, ev.costUsd);
      }
    }
  } catch (err) {
    log.error({ err, chatId }, "opus.background_failed");
    await bot.telegram
      .sendMessage(chatId, `Opus run failed: ${err instanceof Error ? err.message : err}`)
      .catch(() => {});
  } finally {
    const newFiles = collectOutboxFilesSince(chatId, turnStart);
    if (newFiles.length) await deliverOutboxFiles(bot, chatId, newFiles);
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
    await runTurn(ctx, prompt, { attachedPaths: [localPath] });
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
    await runTurn(ctx, prompt, { attachedPaths: [localPath] });
  } catch (err) {
    log.error({ err }, "photo.handler_failed");
    await ctx.reply(`Could not save photo: ${err instanceof Error ? err.message : err}`);
  }
});

bot.on("voice", async (ctx) => {
  const voice = ctx.message.voice;
  const session = getOrCreateSession(ctx.chat.id);
  await ctx.sendChatAction("typing").catch(() => {});
  let localPath: string | null = null;
  try {
    localPath = await downloadTelegramFile(bot, voice.file_id, ctx.chat.id, `${voice.file_unique_id}.oga`);
    const transcript = await transcribeVoice(localPath);
    if (!transcript) {
      await ctx.reply("(couldn't make out anything in that voice note)").catch(() => {});
      return;
    }
    await ctx.reply(`📝 ${transcript}`).catch(() => {});
    const replyAsVoice = session.voiceMode === "voice" || session.voiceMode === "auto";
    await runTurn(ctx, transcript, { replyAsVoice });
  } catch (err) {
    log.error({ err }, "voice.handler_failed");
    await ctx.reply(`Voice handling failed: ${err instanceof Error ? err.message : err}`).catch(() => {});
  } finally {
    if (localPath) {
      try {
        unlinkSync(localPath);
      } catch {}
    }
  }
});

bot.catch((err) => {
  log.error({ err }, "telegraf.error");
});

async function main() {
  initUsage(bot);
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
