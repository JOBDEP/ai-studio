import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { cfg } from "../env";
import type { Story } from "../types";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function storyFromText(text: string, title?: string): Story {
  const firstLine = text.trim().split(/\r?\n/)[0].slice(0, 80);
  const t = title || firstLine;
  return { id: slug(t) || "story", title: t, body: text.trim(), source: "text" };
}

export function storyFromFile(file: string): Story {
  const raw = fs.readFileSync(file, "utf-8");
  const s = storyFromText(raw, path.basename(file, path.extname(file)));
  s.source = `file:${file}`;
  return s;
}

interface RedditPost {
  data: { id: string; title: string; selftext: string; score: number; permalink: string; over_18: boolean };
}

// Reddit's public JSON needs nothing but a descriptive User-Agent.
export async function storiesFromReddit(subreddit: string, limit = 25): Promise<Story[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=${limit}&raw_json=1`;
  const res = await fetch(url, { headers: { "User-Agent": "ai-studio-shorts/0.1 (story feed)" } });
  if (!res.ok) throw new Error(`Reddit fetch failed (${res.status}) for r/${subreddit}`);
  const json = (await res.json()) as { data: { children: RedditPost[] } };
  return json.data.children
    .map((c) => c.data)
    .filter((p) => !p.over_18 && p.selftext && p.selftext.length > 300 && p.selftext.length < 8000)
    .map((p) => ({
      id: `reddit-${p.id}`,
      title: p.title,
      body: p.selftext,
      source: `reddit:r/${subreddit}`,
      url: `https://www.reddit.com${p.permalink}`,
    }));
}

// Stories already turned into shorts, so the feed never repeats one.
const USED_FILE = () => path.join(cfg.jobsDir, "used.json");

export function loadUsed(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(USED_FILE(), "utf-8")) as string[]);
  } catch {
    return new Set();
  }
}

export function markUsed(id: string): void {
  const used = loadUsed();
  used.add(id);
  fs.mkdirSync(cfg.jobsDir, { recursive: true });
  fs.writeFileSync(USED_FILE(), JSON.stringify([...used], null, 2));
}

const PICK_TOOL: Anthropic.Tool = {
  name: "rate_stories",
  description: "Rate each candidate story for its potential as a 45-second animated short.",
  input_schema: {
    type: "object",
    properties: {
      ratings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            score: { type: "integer", minimum: 1, maximum: 10 },
            reason: { type: "string" },
          },
          required: ["index", "score", "reason"],
        },
      },
    },
    required: ["ratings"],
  },
};

export async function pickStory(candidates: Story[], mock: boolean): Promise<Story> {
  const fresh = candidates.filter((c) => !loadUsed().has(c.id));
  if (fresh.length === 0) throw new Error("Every candidate story has already been used.");
  if (fresh.length === 1 || mock) return fresh[0];

  const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  const listing = fresh
    .map((c, i) => `#${i} ${c.title}\n${c.body.slice(0, 600).replace(/\s+/g, " ")}`)
    .join("\n\n");
  const msg = await anthropic.messages.create({
    model: cfg.pickerModel,
    max_tokens: 1500,
    tools: [PICK_TOOL],
    tool_choice: { type: "tool", name: "rate_stories" },
    system:
      "You pick stories for a YouTube Shorts channel that animates the internet's craziest money, scam, heist and windfall stories. Score high: a clear twist, concrete numbers, a villain or a lucky idiot, and a first line that raises a question. Score low: vague, sad without a twist, needs long context, or already famous.",
    messages: [{ role: "user", content: `Rate these ${fresh.length} candidates.\n\n${listing}` }],
  });
  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("Story picker returned no ratings.");
  const ratings = (tool.input as { ratings: { index: number; score: number }[] }).ratings;
  const best = [...ratings].sort((a, b) => b.score - a.score)[0];
  return fresh[best?.index ?? 0] ?? fresh[0];
}
