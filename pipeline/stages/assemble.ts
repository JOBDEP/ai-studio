import path from "node:path";
import { cfg } from "../env";
import { ffmpeg } from "../ffmpeg";
import type { BrollClip } from "../types";

export interface AssembleInput {
  clips: BrollClip[]; // in shot order
  voPath: string;
  assPath: string;
  jobDir: string;
}

// One ffmpeg pass: each clip is looped/trimmed to its shot length, cropped
// to 1080x1920, concatenated, captioned, and married to the loudness-
// normalised voice track.
export async function assemble(input: AssembleInput): Promise<{ finalPath: string; coverPath: string }> {
  const { clips, voPath, assPath, jobDir } = input;
  const finalPath = path.join(jobDir, "final.mp4");
  const coverPath = path.join(jobDir, "cover.jpg");
  const rel = (p: string) => path.relative(jobDir, p).split(path.sep).join("/");

  const args: string[] = [];
  clips.forEach((c) => {
    args.push("-stream_loop", "-1", "-t", c.durationSec.toFixed(3), "-i", rel(c.path));
  });
  args.push("-i", rel(voPath));

  const vParts = clips.map(
    (c, i) =>
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,` +
      `trim=duration=${c.durationSec.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
  );
  const concat = clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${clips.length}:v=1:a=0[vc]`;
  const fontsDir = cfg.captionFontsDir ? `:fontsdir='${cfg.captionFontsDir}'` : "";
  const captioned = `[vc]ass='${rel(assPath)}'${fontsDir}[vout]`;
  const audio = `[${clips.length}:a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;
  const filter = [...vParts, concat, captioned, audio].join(";");

  args.push(
    "-filter_complex", filter,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", "-shortest",
    rel(finalPath)
  );
  await ffmpeg(args, jobDir);

  await ffmpeg(["-ss", "0.5", "-i", rel(finalPath), "-frames:v", "1", "-q:v", "2", rel(coverPath)], jobDir);
  return { finalPath, coverPath };
}
