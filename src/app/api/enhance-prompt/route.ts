import { NextRequest, NextResponse } from "next/server";
import { enhancePrompt } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idea = typeof body.idea === "string" ? body.idea.trim() : "";
    const kind = body.kind === "video" ? "video" : "image";

    if (!idea) {
      return NextResponse.json({ error: "Missing 'idea' text." }, { status: 400 });
    }
    if (idea.length > 2000) {
      return NextResponse.json({ error: "Idea is too long (max 2000 chars)." }, { status: 400 });
    }

    const prompt = await enhancePrompt(idea, kind);
    return NextResponse.json({ prompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
