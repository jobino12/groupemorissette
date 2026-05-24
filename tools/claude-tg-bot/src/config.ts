import { config as loadEnv } from "dotenv";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // dist/
const repoRoot = resolve(here, "..");

// BOT_INSTANCE is set by the launchd plist for instance-based bots.
// When unset (legacy single-bot setup), we load .env + data from the repo root.
const instanceName = process.env.BOT_INSTANCE ?? "";
const instanceDir = instanceName ? join(repoRoot, "instances", instanceName) : repoRoot;

loadEnv({ path: join(instanceDir, ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name} (instance: ${instanceName || "legacy"})`);
  }
  return v;
}

const expand = (p: string) =>
  p.startsWith("~") ? resolve(homedir(), p.slice(1).replace(/^\/+/, "")) : resolve(p);

const defaultDataDir = instanceName ? join(instanceDir, "data") : join(repoRoot, "data");

export const config = {
  instanceName: instanceName || "legacy",
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
  dataDir: process.env.DATA_DIR ? expand(process.env.DATA_DIR) : defaultDataDir,
  chatModel: process.env.CHAT_MODEL ?? "claude-sonnet-4-6",
  heavyModel: process.env.HEAVY_MODEL ?? "claude-opus-4-7",
};

if (process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[config] ANTHROPIC_API_KEY is set. This will bill the Anthropic API per token. " +
      "Unset it to use your Claude Max subscription via `claude login` instead.",
  );
}
