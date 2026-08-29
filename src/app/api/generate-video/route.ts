import { NextRequest, NextResponse } from "next/server";
import { falRun, FalError, FalVideoResult } from "@/lib/fal";
import { getModel } from "@/lib/models";
import { assertWithinBudget, recordSpend } from "@/lib/budget";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "fal-ai/ltx-video";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;

    if (!prompt) {
      return NextResponse.json({ error: "Missing 'prompt' text." }, { status: 400 });
    }

    const model = getModel(modelId);
    if (!model || model.kind !== "video") {
      return NextResponse.json({ error: `Unknown video model: ${modelId}` }, { status: 400 });
    }

    await assertWithinBudget(model.estCostUsd);

    const input: Record<string, unknown> = { prompt };
    if (imageUrl) input.image_url = imageUrl;

    const result = await falRun<FalVideoResult>(model.id, input);

    await recordSpend({ kind: "video", modelId: model.id, costUsd: model.estCostUsd });

    return NextResponse.json({ url: result.video?.url, modelId: model.id, costUsd: model.estCostUsd });
  } catch (err) {
    if (err instanceof Error && err.name === "BudgetExceededError") {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    if (err instanceof FalError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
