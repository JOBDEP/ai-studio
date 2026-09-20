import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { cfg } from "@pipeline/env";
import { runJob } from "@pipeline/run";
import { readStoredConfig, applyToProcessEnv } from "@/lib/pipelineConfig";
import { newJobId, writeStatus, type JobStatus } from "@/lib/shortsJobs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const mock = Boolean(body.mock);

    if (!text) {
      return NextResponse.json({ error: "Write a story first." }, { status: 400 });
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: "Story is too long (max 8000 characters)." }, { status: 400 });
    }

    // Keys saved in Settings live in a file, not the process's real
    // environment — apply them now so this run (and cfg's getters) see them.
    applyToProcessEnv(await readStoredConfig());

    const job = newJobId();
    const jobDir = path.join(cfg.jobsDir, job);
    const status: JobStatus = { state: "running", log: [], startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await writeStatus(jobDir, status);

    // Fire-and-forget: respond with the job id immediately, run the
    // pipeline in the background, and let the client poll /status.
    runJob({ text, mock, job }, async (stage, message) => {
      status.log.push({ stage, message, at: new Date().toISOString() });
      status.updatedAt = new Date().toISOString();
      await writeStatus(jobDir, status);
    })
      .then(async (result) => {
        status.state = "done";
        status.result = { title: result.title, durationSec: result.durationSec };
        status.updatedAt = new Date().toISOString();
        await writeStatus(jobDir, status);
      })
      .catch(async (err: unknown) => {
        status.state = "error";
        status.error = err instanceof Error ? err.message : String(err);
        status.updatedAt = new Date().toISOString();
        await writeStatus(jobDir, status);
      });

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
