import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { log } from "./logger.js";

const exec = promisify(execFile);

const WHISPER_BIN = process.env.WHISPER_BIN ?? "whisper-cli";
const WHISPER_MODEL =
  process.env.WHISPER_MODEL_PATH ?? `${config.dataDir}/models/ggml-small.bin`;
const TTS_VOICE = process.env.TTS_VOICE ?? "Amelie"; // macOS Canadian French
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? "ffmpeg";
const TMP_DIR = join(tmpdir(), "claude-tg-bot");
mkdirSync(TMP_DIR, { recursive: true });

function tmpPath(ext: string): string {
  return join(TMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

async function run(bin: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec(bin, args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`${bin} failed: ${e.stderr?.toString() ?? e.message ?? err}`);
  }
}

export async function transcribeVoice(oggPath: string): Promise<string> {
  if (!existsSync(WHISPER_MODEL)) {
    throw new Error(
      `Whisper model not found at ${WHISPER_MODEL}. See BOOTSTRAP step 2 (voice).`,
    );
  }
  const wav = tmpPath("wav");
  const outBase = tmpPath("out").replace(/\.out$/, "");
  await run(FFMPEG_BIN, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    oggPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    wav,
  ]);
  await run(WHISPER_BIN, [
    "-m",
    WHISPER_MODEL,
    "-l",
    "auto",
    "-nt",
    "-otxt",
    "-of",
    outBase,
    wav,
  ]);
  const txtPath = `${outBase}.txt`;
  const text = readFileSync(txtPath, "utf8").trim();
  for (const p of [wav, txtPath]) {
    try {
      unlinkSync(p);
    } catch {}
  }
  log.info({ length: text.length, source: oggPath }, "voice.transcribed");
  return text;
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const aiff = tmpPath("aiff");
  const oga = tmpPath("oga");
  const textFile = tmpPath("txt");
  writeFileSync(textFile, text, "utf8");
  await run("say", ["-v", TTS_VOICE, "-o", aiff, "-f", textFile]);
  await run(FFMPEG_BIN, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    aiff,
    "-c:a",
    "libopus",
    "-b:a",
    "32k",
    "-application",
    "voip",
    oga,
  ]);
  try {
    unlinkSync(aiff);
    unlinkSync(textFile);
  } catch {}
  return oga;
}

const MAX_TTS_CHARS = 1500;

export function splitForTts(text: string): string[] {
  const cleaned = text.replace(/```[\s\S]*?```/g, "[code block omitted in voice]").trim();
  if (cleaned.length <= MAX_TTS_CHARS) return [cleaned];
  const chunks: string[] = [];
  let remaining = cleaned;
  while (remaining.length > MAX_TTS_CHARS) {
    let cut = remaining.lastIndexOf(". ", MAX_TTS_CHARS);
    if (cut < MAX_TTS_CHARS / 2) cut = MAX_TTS_CHARS;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
