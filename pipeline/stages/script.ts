import Anthropic from "@anthropic-ai/sdk";
import { cfg } from "../env";
import type { Script, Story, UploadMeta } from "../types";

const EMOTIONS = ["neutral", "curious", "shocked", "amused", "serious", "excited", "smug"];
const CAMERAS = ["close-up", "medium", "wide", "over-shoulder", "top-down"];

const SCRIPT_TOOL: Anthropic.Tool = {
  name: "write_script",
  description: "Write the shot-by-shot script for a 40-50 second vertical short.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "YouTube title, under 70 characters, a curiosity hook that the video actually pays off." },
      hook: { type: "string", description: "The first spoken line, under 14 words. Must equal shots[0].text." },
      description: { type: "string", description: "2-3 sentence YouTube description ending with a question to the viewer." },
      hashtags: { type: "array", items: { type: "string" }, maxItems: 5, description: "Without the # sign." },
      shots: {
        type: "array",
        minItems: 6,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Exactly what the narrator says during this shot, 8-25 words." },
            emotion: { type: "string", enum: EMOTIONS },
            action: { type: "string", description: "One short physical action the narrator's character performs, 2-5 words." },
            set: { type: "string", description: "Where this shot takes place, 2-4 words." },
            camera: { type: "string", enum: CAMERAS },
            brollQuery: { type: "string", description: "2-4 concrete visual nouns for a stock-footage search, no people's names." },
          },
          required: ["text", "emotion", "action", "set", "camera", "brollQuery"],
        },
      },
    },
    required: ["title", "hook", "description", "hashtags", "shots"],
  },
};

const SYSTEM = `You write scripts for a YouTube Shorts channel in the style of Zack D Films and Rom: an animated narrator retells the internet's craziest money, scam, heist and windfall stories.

Rules:
- Total spoken length 100-140 words, which is 40-50 seconds. Count them.
- Shot 1 is the hook: under 14 words, raises a question, no greeting, no "today we".
- Structure: hook, setup, escalation, twist, payoff, then a last shot that closes with a one-line reaction and "Subscribe if you love money."
- Every shot is one spoken beat with one visual. Concrete numbers beat adjectives.
- Plain spoken English, short sentences, present tense, second person where it lands ("you find $40,000 in a couch").
- Stories are dramatized for entertainment. Never assert as fact something the source does not say; soften with "reportedly" or "claims".
- Do not use real private people's full names. Public figures and companies are fine.
- brollQuery is for a stock footage search: physical things and places ("stack of cash on table", "bank vault door"), never emotions or names.`;

export async function writeScript(story: Story, mock: boolean): Promise<Script> {
  if (mock) return mockScript(story);

  const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  const msg = await anthropic.messages.create({
    model: cfg.scriptModel,
    max_tokens: 2500,
    tools: [SCRIPT_TOOL],
    tool_choice: { type: "tool", name: "write_script" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Source story titled "${story.title}" (from ${story.source}):\n\n${story.body.slice(0, 6000)}`,
      },
    ],
  });
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("Script writer returned no script.");
  const raw = tool.input as Omit<Script, "shots"> & { shots: Omit<Script["shots"][number], "id">[] };
  const script: Script = {
    ...raw,
    hashtags: raw.hashtags.map((h) => h.replace(/^#/, "")),
    shots: raw.shots.map((s, i) => ({ id: i + 1, ...s })),
  };
  // The hook is spoken as shot 1; keep the two fields from drifting apart.
  script.hook = script.shots[0].text;
  return script;
}

export function narrationOf(script: Script): string {
  return script.shots.map((s) => s.text.trim()).join(" ");
}

export function uploadMetaOf(script: Script): UploadMeta {
  return {
    title: script.title.slice(0, 100),
    description: `${script.description}\n\n${script.hashtags.map((h) => `#${h}`).join(" ")}`,
    tags: script.hashtags,
    categoryId: "24",
    privacyStatus: "private",
    madeForKids: false,
  };
}

// Deterministic script for --mock runs, so the rest of the pipeline can be
// exercised with no API keys and a stable output to compare against.
function mockScript(story: Story): Script {
  const shots: Omit<Script["shots"][number], "id">[] = [
    { text: "This man found forty thousand dollars inside a used couch.", emotion: "curious", action: "points at couch", set: "living room", camera: "medium", brollQuery: "old couch living room" },
    { text: "He bought it from a thrift store for twenty bucks because the cushions felt weirdly heavy.", emotion: "amused", action: "lifts cushion", set: "thrift store", camera: "wide", brollQuery: "thrift store furniture" },
    { text: "At home he unzips the cover and finds envelope after envelope stuffed with cash.", emotion: "shocked", action: "holds envelopes", set: "living room", camera: "close-up", brollQuery: "envelopes cash money table" },
    { text: "Forty one thousand dollars, and a name written on one of the envelopes.", emotion: "serious", action: "reads envelope", set: "living room", camera: "close-up", brollQuery: "handwritten letter envelope" },
    { text: "Most people would keep it. He tracks down the family instead.", emotion: "neutral", action: "dials phone", set: "kitchen", camera: "medium", brollQuery: "person dialing phone kitchen" },
    { text: "Turns out a widow had hidden her late husband's savings in the couch, and her kids donated it by mistake.", emotion: "serious", action: "listens on phone", set: "front porch", camera: "over-shoulder", brollQuery: "elderly woman front porch house" },
    { text: "He returns every dollar. She hands him a thousand back and a hug.", emotion: "excited", action: "hands over money", set: "front porch", camera: "wide", brollQuery: "two people handshake doorstep" },
    { text: "Twenty dollar couch, one thousand dollar reward, priceless story. Subscribe if you love money.", emotion: "smug", action: "shrugs at camera", set: "living room", camera: "close-up", brollQuery: "stack of dollar bills" },
  ];
  return {
    title: `He Found $41,000 In A $20 Couch (${story.title.slice(0, 24)})`,
    hook: shots[0].text,
    description: "A thrift store couch turned out to be a widow's life savings. What would you have done?",
    hashtags: ["money", "shorts", "truestory", "animation"],
    shots: shots.map((s, i) => ({ id: i + 1, ...s })),
  };
}
