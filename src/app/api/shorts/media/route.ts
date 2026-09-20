import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cfg } from "@pipeline/env";
import { isSafeJobId } from "@/lib/shortsJobs";

const ALLOWED: Record<string, string> = { "final.mp4": "video/mp4", "cover.jpg": "image/jpeg" };

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get("job") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!job || !isSafeJobId(job) || !(file in ALLOWED)) {
    return NextResponse.json({ error: "Missing or invalid 'job'/'file'." }, { status: 400 });
  }
  const filePath = path.join(cfg.jobsDir, job, file);
  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": ALLOWED[file], "Content-Length": String(data.length), "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
