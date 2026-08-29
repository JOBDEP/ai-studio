# AI Studio

A small, self-hosted AI image/video generation app — think a lightweight
Higgsfield-style workspace — built for a tight budget:

- **fal.ai** does the actual image and video generation (pay-per-call, cheap).
- **Claude** turns a rough idea into a detailed generation prompt.
- A built-in **monthly budget guard** refuses new generations once your
  configured spend cap is hit, so you can't accidentally blow past your budget.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk` for prompt enhancement
- Plain `fetch` against `fal.run/{model}` for generation (no extra SDK)
- A JSON file ledger (`data/usage.json`) tracking spend — good enough for a
  single-instance personal deployment; swap for Redis/a DB if you deploy to
  a stateless serverless host like Vercel.

## Setup

```bash
npm install
cp .env.example .env   # then fill in FAL_KEY and ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

### Getting API keys

- **fal.ai**: https://fal.ai/dashboard/keys — pay-as-you-go, no subscription.
- **Anthropic (Claude)**: https://console.anthropic.com/settings/keys

### Budget

Set `MONTHLY_BUDGET_USD` in `.env` (defaults to 30). The server checks
estimated spend before every generation call and rejects new ones once
you'd cross the cap for the current calendar month.

Default models are chosen to stretch a $30/month budget:

| Model | Kind | Est. cost/generation |
|---|---|---|
| Flux Schnell | image | ~$0.003 |
| Flux Dev | image | ~$0.025 |
| LTX Video | video | ~$0.04 |
| Kling 1.6 Standard | video | ~$0.40 |

Prices are estimates based on fal.ai's published pricing at the time this
was built — check https://fal.ai/models for current rates, providers change
pricing without much notice.

## How it works

1. Type a rough idea → optionally click **Enhance with Claude** to expand it
   into a detailed prompt (subject, lighting, camera, style).
2. Edit the prompt if you want.
3. Pick a model, and for images, an aspect ratio.
4. Generate — the result lands in the gallery, and the budget meter updates.

## Notes / next steps

- Generations aren't persisted to disk beyond the spend ledger — the gallery
  is in-memory per browser session. Add a DB (Supabase, Postgres, SQLite) if
  you want history across sessions.
- No auth — this is built as a single-user personal tool. Add auth before
  exposing it publicly.
- Video models are notably more expensive than image models; the UI defaults
  to the cheaper LTX Video option to keep a $30/month budget realistic.
