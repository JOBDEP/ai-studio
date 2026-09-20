import fs from "node:fs";
import path from "node:path";

// The Next.js app loads .env on its own; this CLI does not run inside Next,
// so read the file here. Existing process.env values always win.
function loadDotEnv(): void {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Every field is a getter, not a plain value, so it re-reads process.env on
// every access. That's what lets the web UI's Settings panel take effect
// immediately: it writes keys into process.env for the current process
// (see src/lib/pipelineConfig.ts) right before a job runs, with no restart
// and no change needed at any of this file's call sites.
export const cfg = {
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  // Script writing wants the stronger model; story scoring runs on many
  // candidates so it uses the cheap one.
  get scriptModel() {
    return process.env.PIPELINE_SCRIPT_MODEL || "claude-sonnet-5";
  },
  get pickerModel() {
    return process.env.PIPELINE_PICKER_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  },

  // Alternative to Anthropic for the script-writing and story-picking
  // stages — used only when ANTHROPIC_API_KEY isn't set (see pipeline/llm.ts).
  get openaiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get openaiScriptModel() {
    return process.env.OPENAI_SCRIPT_MODEL || "gpt-4o";
  },
  get openaiPickerModel() {
    return process.env.OPENAI_PICKER_MODEL || "gpt-4o-mini";
  },

  get elevenKey() {
    return process.env.ELEVENLABS_API_KEY ?? "";
  },
  get elevenVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID ?? "";
  },
  get elevenModel() {
    return process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
  },
  // Creator plan: $22 for 100k credits, flash models bill 0.5 credit/char.
  get usdPer1kChars() {
    return num("ELEVENLABS_USD_PER_1K_CHARS", 0.11);
  },

  get pexelsKey() {
    return process.env.PEXELS_API_KEY ?? "";
  },

  get youtubeClientId() {
    return process.env.YOUTUBE_CLIENT_ID ?? "";
  },
  get youtubeClientSecret() {
    return process.env.YOUTUBE_CLIENT_SECRET ?? "";
  },
  get youtubeRefreshToken() {
    return process.env.YOUTUBE_REFRESH_TOKEN ?? "";
  },

  get jobsDir() {
    return process.env.PIPELINE_JOBS_DIR || path.join(process.cwd(), "jobs");
  },
  get captionFont() {
    return process.env.CAPTION_FONT || "DejaVu Sans";
  },
  get captionFontsDir() {
    return process.env.CAPTION_FONTS_DIR || "";
  },
};

export function requireKeys(mock: boolean): void {
  if (mock) return;
  const missing: string[] = [];
  if (!cfg.anthropicKey && !cfg.openaiKey) missing.push("ANTHROPIC_API_KEY or OPENAI_API_KEY");
  if (!cfg.elevenKey) missing.push("ELEVENLABS_API_KEY");
  if (!cfg.elevenVoiceId) missing.push("ELEVENLABS_VOICE_ID");
  if (!cfg.pexelsKey) missing.push("PEXELS_API_KEY");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Add them in Settings on the Shorts page, or in .env, or run with --mock to exercise the pipeline without any paid service.`
    );
  }
}
