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

const USAGE = `Usage:
  npm run short -- make --text "story text"        one story, inline
  npm run short -- make --file stories/couch.md     one story from a file
  npm run short -- make --reddit tifu               pick the best unused post from r/tifu this week

Options:
  --mock        no API keys needed: canned script, silent voice, colour plates
  --job NAME    reuse a job folder (stages with output already on disk are skipped)
  --force       redo every stage even if its output exists

Output lands in jobs/<job>/: script.json, vo.mp3, words.json, shots/, captions.ass,
final.mp4, cover.jpg, qa.json, upload.json`;

interface Args {
  cmd: string;
  text?: string;
  file?: string;
  reddit?: string;
  mock: boolean;
  job?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? "", mock: false, force: false };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--mock") a.mock = true;
    else if (k === "--force") a.force = true;
    else if (k === "--text") (a.text = v), i++;
    else if (k === "--file") (a.file = v), i++;
    else if (k === "--reddit") (a.reddit = v), i++;
    else if (k === "--job") (a.job = v), i++;
    else throw new Error(`Unknown argument ${k}\n\n${USAGE}`);
  }
  return a;
}

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

function log(stage: string, msg: string): void {
  console.log(`[${stage}] ${msg}`);
}

async function make(args: Args): Promise<void> {
  requireKeys(args.mock);
  const t0 = Date.now();

  // 1. Story
  let story: Story;
  if (args.text) story = storyFromText(args.text);
  else if (args.file) story = storyFromFile(args.file);
  else if (args.reddit) {
    const candidates = await storiesFromReddit(args.reddit);
    log("story", `${candidates.length} candidates from r/${args.reddit}, ${loadUsed().size} already used`);
    story = await pickStory(candidates, args.mock);
  } else throw new Error(`Give a story with --text, --file or --reddit.\n\n${USAGE}`);
  log("story", `"${story.title}" (${story.source})`);

  const jobName = args.job ?? `${stamp()}-${story.id}`;
  const jobDir = path.join(cfg.jobsDir, jobName);
  fs.mkdirSync(jobDir, { recursive: true });
  writeJson(path.join(jobDir, "story.json"), story);
  const have = (f: string) => !args.force && fs.existsSync(path.join(jobDir, f));

  // 2. Script
  const scriptPath = path.join(jobDir, "script.json");
  let script: Script;
  if (have("script.json")) {
    script = readJson<Script>(scriptPath);
    log("script", "reusing script.json");
  } else {
    script = await writeScript(story, args.mock);
    writeJson(scriptPath, script);
    writeJson(path.join(jobDir, "upload.json"), uploadMetaOf(script));
  }
  const wordCount = narrationOf(script).split(/\s+/).length;
  log("script", `${script.shots.length} shots, ${wordCount} words: "${script.hook}"`);

  // 3. Voice
  let words: Word[];
  let voPath = path.join(jobDir, "vo.mp3");
  let totalSec: number;
  if (have("vo.mp3") && have("words.json")) {
    words = readJson<Word[]>(path.join(jobDir, "words.json"));
    totalSec = await mediaDuration(voPath);
    log("voice", `reusing vo.mp3 (${totalSec.toFixed(1)}s)`);
  } else {
    const v = await synthesize(script, jobDir, args.mock);
    voPath = v.audioPath;
    words = v.words;
    totalSec = await mediaDuration(voPath);
    log("voice", `${words.length} words, ${totalSec.toFixed(1)}s${args.mock ? " (silent mock)" : ""}`);
  }
  const timings = shotTimings(script, words, totalSec);
  writeJson(path.join(jobDir, "timings.json"), timings);

  // 4. B-roll
  const clips = await fetchBroll(script, timings, jobDir, args.mock);
  log("broll", `${clips.length} clips (${clips.filter((c) => c.source !== "cached").length} new)`);

  // 5. Captions + assemble
  const assPath = path.join(jobDir, "captions.ass");
  buildAss(words, assPath);
  log("assemble", "rendering final.mp4");
  const { finalPath, coverPath } = await assemble({ clips, voPath, assPath, jobDir });

  // 6. QA
  const qa = await runQa(finalPath, words);
  writeJson(path.join(jobDir, "qa.json"), qa);
  for (const c of qa.checks) log("qa", `${c.pass ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
  if (!qa.pass) {
    throw new Error(`QA failed for ${jobName}; see ${path.join(jobDir, "qa.json")}`);
  }

  markUsed(story.id);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  log("done", `${finalPath} (${qa.durationSec.toFixed(1)}s, cover ${path.basename(coverPath)}) in ${secs}s`);
  log("done", `title: ${script.title}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "make") return make(args);
  console.log(USAGE);
  process.exitCode = args.cmd ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
