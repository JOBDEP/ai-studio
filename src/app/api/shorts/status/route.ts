import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { cfg } from "@pipeline/env";
import { isSafeJobId, readStatus } from "@/lib/shortsJobs";

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get("job") ?? "";
  if (!job || !isSafeJobId(job)) {
    return NextResponse.json({ error: "Missing or invalid 'job'." }, { status: 400 });
  }
  const status = await readStatus(path.join(cfg.jobsDir, job));
  if (!status) return NextResponse.json({ error: "Unknown job." }, { status: 404 });
  return NextResponse.json(status);
}
