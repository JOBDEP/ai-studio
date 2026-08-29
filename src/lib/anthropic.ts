import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You turn a short, rough idea into a single, richly detailed prompt for an AI image/video generation model.

Rules:
- Output ONLY the enhanced prompt text. No preamble, no quotes, no explanation.
- Be specific: subject, setting, lighting, camera angle/lens, mood, color palette, style.
- Keep it to 2-4 sentences — dense with visual detail, not padded.
- Do not invent a completely different subject than what the user asked for.`;

export async function enhancePrompt(rawIdea: string, kind: "image" | "video"): Promise<string> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  const message = await anthropic.messages.create({
    model,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generation type: ${kind}\nRough idea: ${rawIdea}`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content.");
  }
  return block.text.trim();
}
