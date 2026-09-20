import fs from "node:fs";
import path from "node:path";
import { cfg } from "../env";
import { ffmpeg } from "../ffmpeg";
import { assertWithinBudget, recordSpend } from "../../src/lib/budget";
import type { Script, ShotTiming, Word } from "../types";
import { narrationOf } from "./script";

interface ElevenAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
interface ElevenTimestampResponse {
  audio_base64: string;
  alignment: ElevenAlignment | null;
  normalized_alignment: ElevenAlignment | null;
}

// ElevenLabs returns per-character timings; captions want words.
function wordsFromAlignment(a: ElevenAlignment): Word[] {
  const words: Word[] = [];
  let buf = "";
  let start = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (buf) words.push({ text: buf, start, end: a.character_end_times_seconds[i - 1] });
      buf = "";
    } else {
      if (!buf) start = a.character_start_times_seconds[i];
      buf += ch;
    }
  }
  if (buf) words.push({ text: buf, start, end: a.character_end_times_seconds[a.characters.length - 1] });
  return words;
}

export interface VoiceResult {
  audioPath: string;
  words: Word[];
  durationSec: number;
}

export async function synthesize(script: Script, jobDir: string, mock: boolean): Promise<VoiceResult> {
  const narration = narrationOf(script);
  const wordsPath = path.join(jobDir, "words.json");

  if (mock) {
    // Silent track with evenly spaced words at a typical narration pace, so
    // captions, shot timing and assembly all run exactly as they would live.
    const audioPath = path.join(jobDir, "vo.mp3");
    const tokens = narration.split(/\s+/);
    const perWord = 0.36;
    const words: Word[] = tokens.map((t, i) => ({ text: t, start: i * perWord, end: i * perWord + perWord * 0.85 }));
    const durationSec = tokens.length * perWord + 0.6;
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", durationSec.toFixed(2), "-c:a", "libmp3lame", "-q:a", "6", audioPath]);
    fs.writeFileSync(wordsPath, JSON.stringify(words, null, 2));
    return { audioPath, words, durationSec };
  }

  const estCost = (narration.length / 1000) * cfg.usdPer1kChars;
  await assertWithinBudget(estCost);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoiceId}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": cfg.elevenKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: narration,
      model_id: cfg.elevenModel,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs request failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as ElevenTimestampResponse;
  await recordSpend({ costUsd: estCost, kind: "voice", modelId: cfg.elevenModel });

  const audioPath = path.join(jobDir, "vo.mp3");
  fs.writeFileSync(audioPath, Buffer.from(json.audio_base64, "base64"));
  const alignment = json.alignment ?? json.normalized_alignment;
  if (!alignment) throw new Error("ElevenLabs returned no alignment data; cannot time captions.");
  const words = wordsFromAlignment(alignment);
  fs.writeFileSync(wordsPath, JSON.stringify(words, null, 2));
  const durationSec = words.length ? words[words.length - 1].end + 0.4 : 0;
  return { audioPath, words, durationSec };
}

// Split the timed words back into shots by word count. Each shot lasts from
// its first word to the start of the next shot's first word, so cuts land
// on word boundaries and the last shot runs to the end of the audio.
export function shotTimings(script: Script, words: Word[], totalSec: number): ShotTiming[] {
  const counts = script.shots.map((s) => s.text.trim().split(/\s+/).length);
  const expected = counts.reduce((a, b) => a + b, 0);
  const timings: ShotTiming[] = [];

  if (words.length === expected) {
    let idx = 0;
    for (let i = 0; i < script.shots.length; i++) {
      const start = i === 0 ? 0 : words[idx].start;
      idx += counts[i];
      const end = i === script.shots.length - 1 ? totalSec : words[idx].start;
      timings.push({ id: script.shots[i].id, start, end, durationSec: end - start });
    }
    return timings;
  }

  // Tokenization drifted (the TTS normalized a number, say): fall back to
  // splitting the audio in proportion to each shot's character count.
  const chars = script.shots.map((s) => s.text.length);
  const total = chars.reduce((a, b) => a + b, 0);
  let t = 0;
  for (let i = 0; i < script.shots.length; i++) {
    const dur = (chars[i] / total) * totalSec;
    const end = i === script.shots.length - 1 ? totalSec : t + dur;
    timings.push({ id: script.shots[i].id, start: t, end, durationSec: end - t });
    t = end;
  }
  return timings;
}
