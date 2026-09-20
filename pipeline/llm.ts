import Anthropic from "@anthropic-ai/sdk";
import { cfg } from "./env";

// A tool schema in Anthropic's shape (JSON Schema under input_schema). Kept
// provider-agnostic here so callers don't import the Anthropic SDK just for
// this type; callOpenai below translates it to OpenAI's function-call shape.
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface CallToolInput {
  system: string;
  user: string;
  tool: ToolSpec;
  model: { anthropic: string; openai: string };
  maxTokens: number;
}

// Picks whichever provider has a key configured. Anthropic wins when both
// are set, since every prompt and schema in this pipeline was tuned against
// it; OpenAI is the fallback for anyone using an OpenAI-only key.
export async function callTool<T>(input: CallToolInput): Promise<T> {
  if (cfg.anthropicKey) return callAnthropic<T>(input);
  if (cfg.openaiKey) return callOpenai<T>(input);
  throw new Error("No ANTHROPIC_API_KEY or OPENAI_API_KEY configured.");
}

async function callAnthropic<T>({ system, user, tool, model, maxTokens }: CallToolInput): Promise<T> {
  const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  const msg = await anthropic.messages.create({
    model: model.anthropic,
    max_tokens: maxTokens,
    tools: [tool as Anthropic.Tool],
    tool_choice: { type: "tool", name: tool.name },
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error(`${tool.name}: Anthropic returned no tool call.`);
  return block.input as T;
}

interface OpenaiToolCall {
  function: { name: string; arguments: string };
}
interface OpenaiResponse {
  choices?: { message?: { tool_calls?: OpenaiToolCall[] } }[];
  error?: { message: string };
}

async function callOpenai<T>({ system, user, tool, model, maxTokens }: CallToolInput): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.openaiKey}` },
    body: JSON.stringify({
      model: model.openai,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });
  const json = (await res.json()) as OpenaiResponse;
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${json.error?.message ?? res.statusText}`);
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error(`${tool.name}: OpenAI returned no tool call.`);
  return JSON.parse(call.function.arguments) as T;
}
