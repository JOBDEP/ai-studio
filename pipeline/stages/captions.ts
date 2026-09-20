import fs from "node:fs";
import { cfg } from "../env";
import type { Word } from "../types";

// Word-pop captions in the style every shorts channel uses: up to three
// words on screen, the word being spoken in yellow, big and centred in the
// lower half. Written as ASS so libass renders it inside ffmpeg.

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

function clean(text: string): string {
  return text
    .replace(/[{}\\]/g, "")
    .replace(/["“”]/g, "")
    .toUpperCase();
}

function chunk(words: Word[], maxWords = 3, maxChars = 16): Word[][] {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  let len = 0;
  for (const w of words) {
    const wl = w.text.length;
    if (cur.length && (cur.length >= maxWords || len + wl + 1 > maxChars)) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += wl + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function buildAss(words: Word[], outPath: string): void {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${cfg.captionFont},96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,8,0,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines: string[] = [];
  for (const group of chunk(words)) {
    const groupEnd = group[group.length - 1].end + 0.05;
    for (let i = 0; i < group.length; i++) {
      const start = group[i].start;
      const end = i < group.length - 1 ? group[i + 1].start : groupEnd;
      if (end <= start) continue;
      const text = group
        .map((w, j) => (j === i ? `{\\c&H00FFFF&}${clean(w.text)}{\\c&HFFFFFF&}` : clean(w.text)))
        .join(" ");
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\an5\\pos(540,1260)}${text}`);
    }
  }
  fs.writeFileSync(outPath, header + lines.join("\n") + "\n");
}
