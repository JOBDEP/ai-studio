import fs from "node:fs";
import { ffprobe } from "../ffmpeg";
import type { QaCheck, QaReport, Word } from "../types";

// Hard gates only. Anything that fails here would be rejected or look
// broken on YouTube, so the job stops before the upload stage.
export async function runQa(finalPath: string, words: Word[]): Promise<QaReport> {
  const info = await ffprobe(finalPath);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  const durationSec = Number(info.format.duration ?? 0);
  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  const sizeBytes = fs.statSync(finalPath).size;
  const spokenEnd = words.length ? words[words.length - 1].end : 0;

  const checks: QaCheck[] = [
    { name: "duration", pass: durationSec >= 15 && durationSec <= 60, detail: `${durationSec.toFixed(1)}s (need 15-60s for a Short)` },
    { name: "vertical-1080p", pass: width === 1080 && height === 1920, detail: `${width}x${height}` },
    { name: "has-audio", pass: Boolean(audio), detail: audio ? "audio stream present" : "no audio stream" },
    { name: "captions-cover-voice", pass: spokenEnd > 0 && spokenEnd <= durationSec + 0.1 && spokenEnd >= durationSec * 0.8, detail: `last word ends at ${spokenEnd.toFixed(1)}s of ${durationSec.toFixed(1)}s` },
    { name: "file-size", pass: sizeBytes < 100 * 1024 * 1024, detail: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` },
  ];
  return { pass: checks.every((c) => c.pass), checks, durationSec, width, height, sizeBytes };
}
