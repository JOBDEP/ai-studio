// Thin client for fal.ai's synchronous `fal.run` endpoint. No SDK dependency
// needed — it's a plain authenticated POST.

const FAL_RUN_URL = "https://fal.run";

export class FalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FalError";
    this.status = status;
  }
}

export async function falRun<T = unknown>(modelId: string, input: Record<string, unknown>): Promise<T> {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new FalError("FAL_KEY is not set. Add it to your .env file.", 500);
  }

  const res = await fetch(`${FAL_RUN_URL}/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FalError(`fal.ai request failed (${res.status}): ${text.slice(0, 500)}`, res.status);
  }

  return (await res.json()) as T;
}

export interface FalImageResult {
  images: { url: string; width?: number; height?: number }[];
}

export interface FalVideoResult {
  video: { url: string };
}
