import fs from "node:fs";
import path from "node:path";
import { cfg, requireKeys } from "./env";
import type { Script, Story, Word } from "./types";
import { loadUsed, markUsed, pickStory, storiesFromReddit, storyFromFile, storyFromText } from "./stages/story";
import { narrationOf, uploadMetaOf, writeScript } from "./stages/script";
import { shotTimings, synthesize } from "./stages/voice";
import { fetchBroll } from "./stages/broll";
import { buildAss } from "./stages/captions";
import { assemble } from "./stages/assemble";
import { runQa } from "./stages/qa";
import { mediaDuration } from "./ffmpeg";

// The actual story-to-video pipeline, shared by the CLI (pipeline/cli.ts)
// and the web UI (src/app/api/shorts/generate). Every step reports through
// onProgress instead of printing directly, so a caller can show it in a
// terminal, write it to a status file for polling, or both.

export interface RunJobInput {
  text?: string;
  file?: string;
  reddit?: string;
  mock: boolean;
  job?: string;
  force?: boolean;
}

export interface RunJobResult {
  job: string;
  jobDir: string;
  videoPath: string;
  coverPath: string;
  title: string;
  durationSec: number;
}

export type ProgressFn = (stage: string, message: string) => void | Promise<void>;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}
function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export async function runJob(input: RunJobInput, onProgress: ProgressFn = () => {}): Promise<RunJobResult> {
  requireKeys(input.mock);
  async function log(stage: string, msg: string): Promise<void> {
    await onProgress(stage, msg);
  }

  // 1. Story
  let story: Story;
  if (input.text) story = storyFromText(input.text);
  else if (input.file) story = storyFromFile(input.file);
  else if (input.reddit) {
    const candidates = await storiesFromReddit(input.reddit);
    await log("story", `${candidates.length} candidates from r/${input.reddit}, ${loadUsed().size} already used`);
    story = await pickStory(candidates, input.mock);
  } else {
    throw new Error("Give a story: text, a file, or a subreddit.");
  }
  await log("story", `"${story.title}" (${story.source})`);

  const jobName = input.job ?? `${stamp()}-${story.id}`;
  const jobDir = path.join(cfg.jobsDir, jobName);
  fs.mkdirSync(jobDir, { recursive: true });
  writeJson(path.join(jobDir, "story.json"), story);
  const have = (f: string) => !input.force && fs.existsSync(path.join(jobDir, f));

  // 2. Script
  const scriptPath = path.join(jobDir, "script.json");
  let script: Script;
  if (have("script.json")) {
    script = readJson<Script>(scriptPath);
    await log("script", "reusing script.json");
  } else {
    script = await writeScript(story, input.mock);
    writeJson(scriptPath, script);
    writeJson(path.join(jobDir, "upload.json"), uploadMetaOf(script));
  }
  const wordCount = narrationOf(script).split(/\s+/).length;
  await log("script", `${script.shots.length} shots, ${wordCount} words: "${script.hook}"`);

  // 3. Voice
  let words: Word[];
  let voPath = path.join(jobDir, "vo.mp3");
  let totalSec: number;
  if (have("vo.mp3") && have("words.json")) {
    words = readJson<Word[]>(path.join(jobDir, "words.json"));
    totalSec = await mediaDuration(voPath);
    await log("voice", `reusing vo.mp3 (${totalSec.toFixed(1)}s)`);
  } else {
    const v = await synthesize(script, jobDir, input.mock);
    voPath = v.audioPath;
    words = v.words;
    totalSec = await mediaDuration(voPath);
    await log("voice", `${words.length} words, ${totalSec.toFixed(1)}s${input.mock ? " (silent mock)" : ""}`);
  }
  const timings = shotTimings(script, words, totalSec);
  writeJson(path.join(jobDir, "timings.json"), timings);

  // 4. B-roll
  const clips = await fetchBroll(script, timings, jobDir, input.mock);
  await log("broll", `${clips.length} clips (${clips.filter((c) => c.source !== "cached").length} new)`);

  // 5. Captions + assemble
  const assPath = path.join(jobDir, "captions.ass");
  buildAss(words, assPath);
  await log("assemble", "rendering final.mp4");
  const { finalPath, coverPath } = await assemble({ clips, voPath, assPath, jobDir });

  // 6. QA
  const qa = await runQa(finalPath, words);
  writeJson(path.join(jobDir, "qa.json"), qa);
  for (const c of qa.checks) await log("qa", `${c.pass ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  if (!qa.pass) {
    throw new Error(`QA failed for ${jobName}; see ${path.join(jobDir, "qa.json")}`);
  }

  markUsed(story.id);
  await log("done", `${script.title} (${qa.durationSec.toFixed(1)}s)`);

  return { job: jobName, jobDir, videoPath: finalPath, coverPath, title: script.title, durationSec: qa.durationSec };
}
