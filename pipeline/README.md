# Shorts pipeline (phase 1)

Story in, upload-ready vertical short out. Every stage writes its output to
`jobs/<job>/` and is skipped on re-run if that output already exists, so a
failed run resumes where it stopped.

```
story ──► script (Claude) ──► voice (ElevenLabs, word timestamps)
                                  │
                                  ▼
       b-roll (Pexels) ──► captions (ASS) ──► assemble (ffmpeg) ──► QA ──► final.mp4
```

## Run it

```bash
cp .env.example .env            # fill ANTHROPIC_API_KEY, ELEVENLABS_*, PEXELS_API_KEY
npm install

npm run short -- make --mock --text "A man finds $41,000 in a thrift-store couch."
npm run short -- make --text "…"          # real script, voice and footage
npm run short -- make --file stories/x.md
npm run short -- make --reddit tifu       # best unused post from r/tifu this week
```

`--mock` needs no keys at all: canned script, silent voice track, colour
plates instead of footage. It exercises timing, captions, assembly and QA
exactly as a live run does, and finishes in about 15 seconds.

## What lands in `jobs/<job>/`

| File | Written by | What it is |
|---|---|---|
| `story.json` | story | the source story |
| `script.json` | script | the shot list — the contract every later stage reads |
| `upload.json` | script | title, description, tags for the upload stage |
| `vo.mp3`, `words.json` | voice | narration and per-word timestamps |
| `timings.json` | voice | start/end of each shot, derived from the words |
| `shots/src_NN.mp4` | b-roll | one clip per shot |
| `captions.ass` | captions | word-pop subtitles |
| `final.mp4`, `cover.jpg` | assemble | 1080×1920, 30 fps, H.264 + AAC, loudness-normalised |
| `qa.json` | qa | pass/fail per check; the job stops here if anything fails |

## The script contract

`script.json` is what makes the render stage swappable. Each shot carries
`text`, `emotion`, `action`, `set`, `camera` and `brollQuery`. Phase 1 only
uses `brollQuery` (Pexels search). Phase 2 replaces `stages/broll.ts` with a
3D render that reads `action`, `set` and `camera` instead; nothing upstream
or downstream changes.

## Cost guard

Voice synthesis goes through the same monthly budget guard as image and
video generation (`src/lib/budget.ts`, `MONTHLY_BUDGET_USD`). The estimate
is `ELEVENLABS_USD_PER_1K_CHARS` × characters spoken.

## Not in phase 1

Upload (`upload.json` is ready for it, YouTube needs OAuth rather than an
API key), scheduling, TikTok/Instagram, the feedback loop, and the 3D
render tier.
