const MAX_MSG = 4000;

export function chunkForTelegram(text: string): string[] {
  if (text.length <= MAX_MSG) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MSG) {
    let cut = remaining.lastIndexOf("\n", MAX_MSG);
    if (cut < MAX_MSG / 2) cut = MAX_MSG;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, "");
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

export function escapeMdV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
