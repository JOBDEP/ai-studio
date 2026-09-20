import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Prefer the static binaries from npm so the pipeline runs on any box
// (GitHub Actions, a VPS, Windows) without a system ffmpeg. Fall back to
// whatever is on PATH.
export function ffmpegBin(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return require("ffmpeg-static") as string;
  } catch {
    return "ffmpeg";
  }
}

export function ffprobeBin(): string {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  try {
    return (require("ffprobe-static") as { path: string }).path;
  } catch {
    return "ffprobe";
  }
}

function runBin(bin: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}:\n${stderr.split("\n").slice(-25).join("\n")}`));
    });
  });
}

export async function ffmpeg(args: string[], cwd?: string): Promise<void> {
  await runBin(ffmpegBin(), ["-hide_banner", "-loglevel", "error", "-y", ...args], cwd);
}

export interface ProbeStream {
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
}
export interface ProbeResult {
  format: { duration?: string; size?: string };
  streams: ProbeStream[];
}

export async function ffprobe(file: string): Promise<ProbeResult> {
  const { stdout } = await runBin(ffprobeBin(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  return JSON.parse(stdout) as ProbeResult;
}

export async function mediaDuration(file: string): Promise<number> {
  const info = await ffprobe(file);
  return Number(info.format.duration ?? 0);
}
