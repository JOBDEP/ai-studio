import { promises as fs } from "fs";
import path from "path";

// Progress for one web-UI job, polled by the browser while the pipeline
// runs server-side. Written to jobs/<job>/status.json rather than kept in
// memory so it survives a dev-server reload and works the same way if this
// ever runs behind more than one process.

export interface JobLogLine {
  stage: string;
  message: string;
  at: string;
}

export interface JobStatus {
  state: "running" | "done" | "error";
  log: JobLogLine[];
  result?: { title: string; durationSec: number };
  error?: string;
  startedAt: string;
  updatedAt: string;
}

function statusPath(jobDir: string): string {
  return path.join(jobDir, "status.json");
}

export async function writeStatus(jobDir: string, status: JobStatus): Promise<void> {
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(statusPath(jobDir), JSON.stringify(status));
}

export async function readStatus(jobDir: string): Promise<JobStatus | null> {
  try {
    return JSON.parse(await fs.readFile(statusPath(jobDir), "utf-8")) as JobStatus;
  } catch {
    return null;
  }
}

// A job id the pipeline hasn't created a folder for yet, safe to embed in a
// path (no slashes, dots, or anything a client controls beyond this shape).
export function newJobId(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `web-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${rand}`;
}

const SAFE_JOB_ID = /^[a-zA-Z0-9_-]+$/;

export function isSafeJobId(job: string): boolean {
  return SAFE_JOB_ID.test(job);
}
