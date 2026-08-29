import { NextRequest, NextResponse } from "next/server";
import { falRun, FalError, FalImageResult } from "@/lib/fal";
import { getModel } from "@/lib/models";
import { assertWithinBudget, recordSpend } from "@/lib/budget";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "fal-ai/flux/schnell";
    const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "1:1";

    if (!prompt) {
      return NextResponse.json({ error: "Missing 'prompt' text." }, { status: 400 });
    }

    const model = getModel(modelId);
    if (!model || model.kind !== "image") {
      return NextResponse.json({ error: `Unknown image model: ${modelId}` }, { status: 400 });
    }

    await assertWithinBudget(model.estCostUsd);

    const result = await falRun<FalImageResult>(model.id, {
      prompt,
      image_size: aspectRatioToSize(aspectRatio),
      num_images: 1,
    });

    await recordSpend({ kind: "image", modelId: model.id, costUsd: model.estCostUsd });

    return NextResponse.json({ url: result.images?.[0]?.url, modelId: model.id, costUsd: model.estCostUsd });
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

function aspectRatioToSize(ratio: string): string {
  switch (ratio) {
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "4:3":
      return "landscape_4_3";
    case "1:1":
    default:
      return "square_hd";
  }
}
