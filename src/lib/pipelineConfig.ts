import { promises as fs } from "fs";
import path from "path";

// Lets the Shorts page's Settings panel store API keys without editing
// .env by hand. Same file-ledger pattern as budget.ts: a JSON file under
// data/, gitignored, fine for a single-instance local or VPS deployment.
//
// Stored keys are applied into process.env for the running process right
// before a job starts (see applyToProcessEnv) — pipeline/env.ts reads
// process.env through getters, so this takes effect immediately with no
// restart. A key already set in the real environment (e.g. a hosting
// platform's secret store) is left alone: this file only fills gaps.

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "pipeline-config.json");

export interface StoredConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  pexelsApiKey?: string;
}

const FIELD_TO_ENV: Record<keyof StoredConfig, string> = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  elevenlabsApiKey: "ELEVENLABS_API_KEY",
  elevenlabsVoiceId: "ELEVENLABS_VOICE_ID",
  pexelsApiKey: "PEXELS_API_KEY",
};

export async function readStoredConfig(): Promise<StoredConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return {};
  }
}

// Only fields present in `patch` are touched; an empty string clears that
// field, an omitted field keeps whatever was already stored.
export async function writeStoredConfig(patch: StoredConfig): Promise<StoredConfig> {
  const current = await readStoredConfig();
  const merged: StoredConfig = { ...current };
  for (const key of Object.keys(FIELD_TO_ENV) as (keyof StoredConfig)[]) {
    if (key in patch) {
      const v = patch[key];
      if (v) merged[key] = v;
      else delete merged[key];
    }
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export function applyToProcessEnv(config: StoredConfig): void {
  for (const key of Object.keys(FIELD_TO_ENV) as (keyof StoredConfig)[]) {
    const v = config[key];
    if (v) process.env[FIELD_TO_ENV[key]] = v;
  }
}

function mask(value: string): string {
  if (value.length <= 4) return "•".repeat(value.length);
  return "•".repeat(value.length - 4) + value.slice(-4);
}

export interface FieldStatus {
  set: boolean;
  source: "settings" | "env" | "none";
  preview: string; // masked, or "" if not set
}

export interface ConfigStatus {
  anthropicApiKey: FieldStatus;
  openaiApiKey: FieldStatus;
  elevenlabsApiKey: FieldStatus;
  elevenlabsVoiceId: FieldStatus;
  pexelsApiKey: FieldStatus;
}

// What the Settings panel renders: never the real value, just whether each
// key is set and where it came from, so a saved key doesn't need to be
// retyped to show as configured.
export async function statusForUi(): Promise<ConfigStatus> {
  const stored = await readStoredConfig();
  const out = {} as ConfigStatus;
  for (const key of Object.keys(FIELD_TO_ENV) as (keyof StoredConfig)[]) {
    const storedVal = stored[key];
    const envVal = process.env[FIELD_TO_ENV[key]];
    if (storedVal) out[key] = { set: true, source: "settings", preview: mask(storedVal) };
    else if (envVal) out[key] = { set: true, source: "env", preview: mask(envVal) };
    else out[key] = { set: false, source: "none", preview: "" };
  }
  return out;
}
