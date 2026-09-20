import fs from "node:fs";
import path from "node:path";
import { cfg } from "./env";
import { uploadMetaOf } from "./stages/script";
import { uploadVideo } from "./stages/upload";
import { runJob } from "./run";

const USAGE = `Usage:
  npm run short -- make --text "story text"        one story, inline
  npm run short -- make --file stories/couch.md     one story from a file
  npm run short -- make --reddit tifu               pick the best unused post from r/tifu this week
  npm run short -- upload --job NAME                upload a finished job to YouTube
  npm run youtube-auth                              one-time: get a YOUTUBE_REFRESH_TOKEN

Options for make:
  --mock        no API keys needed: canned script, silent voice, colour plates
  --job NAME    reuse a job folder (stages with output already on disk are skipped)
  --force       redo every stage even if its output exists

Options for upload:
  --job NAME    required: the jobs/<job>/ folder to upload
  --dry-run     print what would be uploaded, no network calls, no OAuth needed
  --public      publish immediately (default: private, so you can preview it first)

Output lands in jobs/<job>/: script.json, vo.mp3, words.json, shots/, captions.ass,
final.mp4, cover.jpg, qa.json, upload.json, uploaded.json`;

interface Args {
  cmd: string;
  text?: string;
  file?: string;
  reddit?: string;
  mock: boolean;
  job?: string;
  force: boolean;
  dryRun: boolean;
  public: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] ?? "", mock: false, force: false, dryRun: false, public: false };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--mock") a.mock = true;
    else if (k === "--force") a.force = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--public") a.public = true;
    else if (k === "--text") (a.text = v), i++;
    else if (k === "--file") (a.file = v), i++;
    else if (k === "--reddit") (a.reddit = v), i++;
    else if (k === "--job") (a.job = v), i++;
    else throw new Error(`Unknown argument ${k}\n\n${USAGE}`);
  }
  return a;
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
  if (!args.text && !args.file && !args.reddit) throw new Error(`Give a story with --text, --file or --reddit.\n\n${USAGE}`);
  const t0 = Date.now();
  const result = await runJob(
    { text: args.text, file: args.file, reddit: args.reddit, mock: args.mock, job: args.job, force: args.force },
    (stage, message) => log(stage, message)
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  log("done", `${result.videoPath} (${result.durationSec.toFixed(1)}s, cover ${path.basename(result.coverPath)}) in ${secs}s`);
  log("done", `title: ${result.title}`);
}

async function upload(args: Args): Promise<void> {
  if (!args.job) throw new Error(`--job NAME is required for upload.\n\n${USAGE}`);
  const jobDir = path.join(cfg.jobsDir, args.job);
  const finalPath = path.join(jobDir, "final.mp4");
  const coverPath = path.join(jobDir, "cover.jpg");
  const metaPath = path.join(jobDir, "upload.json");
  for (const [label, file] of [["video", finalPath], ["upload metadata", metaPath]] as const) {
    if (!fs.existsSync(file)) throw new Error(`No ${label} at ${file} — run "make --job ${args.job}" first.`);
  }
  const qaPath = path.join(jobDir, "qa.json");
  if (fs.existsSync(qaPath) && !readJson<{ pass: boolean }>(qaPath).pass) {
    throw new Error(`${qaPath} recorded a QA failure for this job — fix and re-run "make" before uploading.`);
  }

  const meta = readJson<ReturnType<typeof uploadMetaOf>>(metaPath);
  if (args.public) meta.privacyStatus = "public";

  log("upload", `${args.dryRun ? "(dry run) " : ""}uploading ${jobDir}`);
  const result = await uploadVideo({
    jobDir,
    meta,
    videoPath: finalPath,
    thumbnailPath: fs.existsSync(coverPath) ? coverPath : undefined,
    dryRun: args.dryRun,
  });
  if (!args.dryRun) {
    writeJson(path.join(jobDir, "uploaded.json"), result);
    log("upload", `live at ${result.url} (privacy: ${meta.privacyStatus}, thumbnail set: ${result.thumbnailSet})`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "make") return make(args);
  if (args.cmd === "upload") return upload(args);
  console.log(USAGE);
  process.exitCode = args.cmd ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
