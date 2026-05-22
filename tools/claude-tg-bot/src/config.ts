import "dotenv/config";
import { homedir } from "node:os";
import { resolve } from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const expand = (p: string) => (p.startsWith("~") ? resolve(homedir(), p.slice(1).replace(/^\/+/, "")) : resolve(p));

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  allowedUserIds: required("ALLOWED_USER_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`ALLOWED_USER_IDS contains non-numeric value: ${s}`);
      return n;
    }),
  defaultCwd: expand(process.env.DEFAULT_CWD ?? `${homedir()}/code`),
  dataDir: expand(process.env.DATA_DIR ?? "./data"),
};

if (process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[config] ANTHROPIC_API_KEY is set. This will bill the Anthropic API per token. " +
      "Unset it to use your Claude Max subscription via `claude login` instead.",
  );
}
