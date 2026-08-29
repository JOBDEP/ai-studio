// Model catalog. Prices are per-generation estimates in USD, based on
// published fal.ai pricing at the time this was written — verify current
// rates at https://fal.ai/models before relying on them, providers change
// pricing without much notice.

export type ModelKind = "image" | "video";

export interface ModelSpec {
  id: string; // fal.ai endpoint id
  label: string;
  kind: ModelKind;
  estCostUsd: number; // per single generation (per image, or per short clip)
  description: string;
}

export const MODELS: ModelSpec[] = [
  {
    id: "fal-ai/flux/schnell",
    label: "Flux Schnell (fast, cheap)",
    kind: "image",
    estCostUsd: 0.003,
    description: "Great default. Very fast, very cheap, solid quality.",
  },
  {
    id: "fal-ai/flux/dev",
    label: "Flux Dev (higher quality)",
    kind: "image",
    estCostUsd: 0.025,
    description: "Slower and pricier, but sharper detail and prompt following.",
  },
  {
    id: "fal-ai/ltx-video",
    label: "LTX Video (budget video)",
    kind: "video",
    estCostUsd: 0.04,
    description: "Cheapest usable text/image-to-video option — good for a tight budget.",
  },
  {
    id: "fal-ai/kling-video/v1.6/standard/image-to-video",
    label: "Kling 1.6 Standard (premium video)",
    kind: "video",
    estCostUsd: 0.4,
    description: "Much higher quality motion, closer to Higgsfield/Kling output — costs ~10x more per clip.",
  },
];

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}
