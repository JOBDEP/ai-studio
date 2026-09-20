import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { cfg } from "../env";
import { ffmpeg } from "../ffmpeg";
import type { BrollClip, Script, ShotTiming } from "../types";

interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
  quality: string;
  file_type: string;
}
interface PexelsVideo {
  id: number;
  url: string;
  duration: number;
  video_files: PexelsVideoFile[];
}
interface PexelsSearch {
  videos: PexelsVideo[];
}

// Pick the file closest to 1080x1920; anything portrait and at least 1080
// tall crops cleanly. Fall back to the largest available.
function bestFile(v: PexelsVideo): PexelsVideoFile | undefined {
  const mp4 = v.video_files.filter((f) => f.file_type === "video/mp4");
  const portrait = mp4.filter((f) => f.height >= 1080 && f.height > f.width);
  if (portrait.length) return portrait.sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920))[0];
  return mp4.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

async function searchPexels(query: string, minDuration: number, exclude: Set<number>): Promise<PexelsVideo | undefined> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=10`;
  const res = await fetch(url, { headers: { Authorization: cfg.pexelsKey } });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
  const json = (await res.json()) as PexelsSearch;
  const usable = json.videos.filter((v) => !exclude.has(v.id) && bestFile(v));
  // Prefer a clip that covers the shot without looping; otherwise take the longest.
  return usable.find((v) => v.duration >= minDuration) ?? usable.sort((a, b) => b.duration - a.duration)[0];
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
}

const MOCK_COLORS = ["0x1f3a5f", "0x3b2f5c", "0x2f5c3b", "0x5c2f2f", "0x5c4a2f", "0x2f5c5c", "0x4a4a4a", "0x5c2f4a", "0x2f3b5c", "0x3b5c2f"];

export async function fetchBroll(script: Script, timings: ShotTiming[], jobDir: string, mock: boolean): Promise<BrollClip[]> {
  const dir = path.join(jobDir, "shots");
  fs.mkdirSync(dir, { recursive: true });
  const clips: BrollClip[] = [];
  const used = new Set<number>();

  for (const shot of script.shots) {
    const timing = timings.find((t) => t.id === shot.id)!;
    const dest = path.join(dir, `src_${String(shot.id).padStart(2, "0")}.mp4`);

    if (fs.existsSync(dest)) {
      clips.push({ shotId: shot.id, path: dest, source: "cached", durationSec: timing.durationSec });
      continue;
    }

    if (mock) {
      // A flat colour plate per shot, so the assembled short shows the cuts.
      const color = MOCK_COLORS[(shot.id - 1) % MOCK_COLORS.length];
      await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=1080x1920:r=30`, "-t", Math.max(1, timing.durationSec).toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", dest]);
      clips.push({ shotId: shot.id, path: dest, source: "mock", durationSec: timing.durationSec });
      continue;
    }

    let video = await searchPexels(shot.brollQuery, timing.durationSec, used);
    if (!video) video = await searchPexels(shot.set, timing.durationSec, used);
    if (!video) throw new Error(`No Pexels footage for shot ${shot.id} ("${shot.brollQuery}" / "${shot.set}").`);
    used.add(video.id);
    await download(bestFile(video)!.link, dest);
    clips.push({ shotId: shot.id, path: dest, source: video.url, durationSec: timing.durationSec });
  }
  return clips;
}
