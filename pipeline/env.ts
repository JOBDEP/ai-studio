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

export const cfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Script writing wants the stronger model; story scoring runs on many
  // candidates so it uses the cheap one.
  scriptModel: process.env.PIPELINE_SCRIPT_MODEL || "claude-sonnet-5",
  pickerModel: process.env.PIPELINE_PICKER_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",

  elevenKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
  elevenModel: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
  // Creator plan: $22 for 100k credits, flash models bill 0.5 credit/char.
  usdPer1kChars: num("ELEVENLABS_USD_PER_1K_CHARS", 0.11),

  pexelsKey: process.env.PEXELS_API_KEY ?? "",

  jobsDir: process.env.PIPELINE_JOBS_DIR || path.join(process.cwd(), "jobs"),
  captionFont: process.env.CAPTION_FONT || "DejaVu Sans",
  captionFontsDir: process.env.CAPTION_FONTS_DIR || "",
};

export function requireKeys(mock: boolean): void {
  if (mock) return;
  const missing: string[] = [];
  if (!cfg.anthropicKey) missing.push("ANTHROPIC_API_KEY");
  if (!cfg.elevenKey) missing.push("ELEVENLABS_API_KEY");
  if (!cfg.elevenVoiceId) missing.push("ELEVENLABS_VOICE_ID");
  if (!cfg.pexelsKey) missing.push("PEXELS_API_KEY");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")} in .env. Add them, or run with --mock to exercise the pipeline without any paid service.`
    );
  }
}
