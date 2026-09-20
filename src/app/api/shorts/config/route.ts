import { NextRequest, NextResponse } from "next/server";
import { applyToProcessEnv, statusForUi, writeStoredConfig, type StoredConfig } from "@/lib/pipelineConfig";

const FIELDS = ["anthropicApiKey", "elevenlabsApiKey", "elevenlabsVoiceId", "pexelsApiKey"] as const;

export async function GET() {
  return NextResponse.json(await statusForUi());
}

// Never returns the values back — only whether each key is set now, same
// as GET. Send "" for a field to clear it; omit a field to leave it alone.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const patch: StoredConfig = {};
    for (const field of FIELDS) {
      if (typeof body[field] === "string") patch[field] = body[field].trim();
    }
    const merged = await writeStoredConfig(patch);
    applyToProcessEnv(merged);
    return NextResponse.json(await statusForUi());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
