import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Context, Telegraf } from "telegraf";
import { addJob, cancelJob, listJobs } from "./scheduler.js";
import {
  getOrCreateSession,
  resetSession,
  setCwd,
  setVoiceMode,
} from "./sessions.js";
import { formatUsage, getUsage } from "./usage.js";
import type { VoiceMode } from "./db.js";

const HELP = `Hi! I'm your Claude home-Mac bot.

Just message me to chat with Claude. The session persists across messages.

Commands:
/ping — health check
/reset — start a fresh Claude session for this chat
/pwd — show the working directory Claude is using
/cd <path> — change Claude's working directory (e.g. /cd ~/code/groupemorissette)
/voice <auto|on|off> — reply mode. auto = match input (voice→voice, text→text)
/usage — show current Claude usage (5-hour + weekly windows)
/opus <prompt> — run a heavy/deep task against Opus in the background (doesn't block chat)
/schedule <cron> | <prompt> — schedule a recurring prompt
  e.g. /schedule 0 9 * * 1-5 | summarize overnight CI activity
/jobs — list scheduled jobs in this chat
/cancel <id> — remove a scheduled job
/help — this message`;

function expandHome(p: string): string {
  if (p.startsWith("~")) return resolve(homedir(), p.slice(1).replace(/^\/+/, ""));
  return resolve(p);
}

export function registerCommands(bot: Telegraf): void {
  bot.command("start", async (ctx) => ctx.reply(HELP));
  bot.command("help", async (ctx) => ctx.reply(HELP));
  bot.command("ping", async (ctx) => ctx.reply("pong"));

  bot.command("pwd", async (ctx) => {
    const s = getOrCreateSession(ctx.chat.id);
    await ctx.reply(s.cwd);
  });

  bot.command("cd", async (ctx) => {
    const arg = stripCommand(ctx);
    if (!arg) return ctx.reply("Usage: /cd <path>");
    const target = expandHome(arg);
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      return ctx.reply(`Not a directory: ${target}`);
    }
    setCwd(ctx.chat.id, target);
    resetSession(ctx.chat.id);
    await ctx.reply(`cwd → ${target}\n(session reset so Claude picks up the new directory's CLAUDE.md)`);
  });

  bot.command("reset", async (ctx) => {
    resetSession(ctx.chat.id);
    await ctx.reply("Session cleared. Next message starts fresh.");
  });

  bot.command("usage", async (ctx) => {
    const u = getUsage();
    await ctx.reply("```\n" + formatUsage(u) + "\n```", { parse_mode: "Markdown" });
  });

  bot.command("voice", async (ctx) => {
    const arg = stripCommand(ctx).toLowerCase();
    const valid: Record<string, VoiceMode> = { auto: "auto", on: "voice", off: "text", voice: "voice", text: "text" };
    const mode = valid[arg];
    if (!mode) {
      const current = getOrCreateSession(ctx.chat.id).voiceMode;
      return ctx.reply(
        `Voice mode: ${current}\nUsage: /voice <auto|on|off>\n  auto — voice in → voice out, text in → text out\n  on — always reply with voice\n  off — always reply with text`,
      );
    }
    setVoiceMode(ctx.chat.id, mode);
    await ctx.reply(`Voice mode → ${mode}`);
  });

  bot.command("schedule", async (ctx) => {
    const arg = stripCommand(ctx);
    if (!arg || !arg.includes("|")) {
      return ctx.reply(
        "Usage: /schedule <cron expr> | <prompt>\nExample: /schedule 0 9 * * 1-5 | summarize overnight CI",
      );
    }
    const [cronPart, ...rest] = arg.split("|");
    const promptText = rest.join("|").trim();
    if (!promptText) return ctx.reply("Missing prompt after `|`.");
    try {
      const session = getOrCreateSession(ctx.chat.id);
      const job = addJob(bot, ctx.chat.id, cronPart.trim(), promptText, session.cwd);
      await ctx.reply(`Scheduled job #${job.id} — \`${job.cron_expr}\` in ${session.cwd}`);
    } catch (err) {
      await ctx.reply(`Could not schedule: ${err instanceof Error ? err.message : err}`);
    }
  });

  bot.command("jobs", async (ctx) => {
    const jobs = listJobs(ctx.chat.id);
    if (jobs.length === 0) return ctx.reply("No scheduled jobs.");
    const lines = jobs.map(
      (j) => `#${j.id} \`${j.cron_expr}\` (${j.cwd ?? "default cwd"})\n   ${j.prompt}`,
    );
    await ctx.reply(lines.join("\n\n"));
  });

  bot.command("cancel", async (ctx) => {
    const arg = stripCommand(ctx);
    const id = Number(arg);
    if (!Number.isFinite(id)) return ctx.reply("Usage: /cancel <id>");
    const ok = cancelJob(ctx.chat.id, id);
    await ctx.reply(ok ? `Cancelled #${id}` : `No job #${id} in this chat.`);
  });
}

function stripCommand(ctx: Context): string {
  const text = (ctx.message as { text?: string } | undefined)?.text ?? "";
  const space = text.indexOf(" ");
  return space === -1 ? "" : text.slice(space + 1).trim();
}
