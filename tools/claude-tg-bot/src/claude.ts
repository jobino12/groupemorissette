import { query } from "@anthropic-ai/claude-agent-sdk";
import { log } from "./logger.js";
import { setSessionId, type ChatSession } from "./sessions.js";

export type ClaudeEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; brief: string }
  | { kind: "done"; costUsd?: number; durationMs?: number; numTurns?: number }
  | { kind: "error"; message: string };

function briefForToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return name;
  const inp = input as Record<string, unknown>;
  if (typeof inp.command === "string") return `\`${truncate(inp.command, 120)}\``;
  if (typeof inp.file_path === "string") return `\`${inp.file_path}\``;
  if (typeof inp.path === "string") return `\`${inp.path}\``;
  if (typeof inp.pattern === "string") return `\`${inp.pattern}\``;
  if (typeof inp.url === "string") return inp.url;
  return name;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function* runClaude(
  session: ChatSession,
  userText: string,
  contextPrefix = "",
): AsyncGenerator<ClaudeEvent, void, undefined> {
  const options: Record<string, unknown> = {
    cwd: session.cwd,
    permissionMode: "bypassPermissions",
  };
  if (session.sessionId) options.resume = session.sessionId;

  log.info({ chatId: session.chatId, cwd: session.cwd, resume: session.sessionId ?? null }, "claude.start");

  const prompt = contextPrefix ? `${contextPrefix}${userText}` : userText;

  try {
    for await (const message of query({ prompt, options: options as never })) {
      const m = message as { type: string; [k: string]: unknown };

      if (m.type === "system" && (m as { subtype?: string }).subtype === "init") {
        const sid = (m as { session_id?: string }).session_id;
        if (sid && sid !== session.sessionId) {
          setSessionId(session.chatId, sid);
          session.sessionId = sid;
          yield { kind: "session", sessionId: sid };
        }
        continue;
      }

      if (m.type === "assistant") {
        const inner = (m as { message?: { content?: unknown[] } }).message;
        const blocks = inner?.content ?? [];
        for (const block of blocks as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            yield { kind: "text", text: block.text };
          } else if (block.type === "tool_use" && typeof block.name === "string") {
            yield { kind: "tool", name: block.name, brief: briefForToolInput(block.name, block.input) };
          }
        }
        continue;
      }

      if (m.type === "result") {
        const r = m as {
          subtype?: string;
          total_cost_usd?: number;
          duration_ms?: number;
          num_turns?: number;
        };
        if (r.subtype && r.subtype !== "success") {
          yield { kind: "error", message: `Claude returned ${r.subtype}` };
        }
        yield {
          kind: "done",
          costUsd: r.total_cost_usd,
          durationMs: r.duration_ms,
          numTurns: r.num_turns,
        };
        return;
      }
    }
  } catch (err) {
    log.error({ err, chatId: session.chatId }, "claude.error");
    yield { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
