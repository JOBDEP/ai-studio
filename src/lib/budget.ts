import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

// Spend tracking, with two backends:
//
// 1. Upstash Redis (used automatically when UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are set) — works on stateless serverless
//    hosts like Vercel, since state lives in Redis, not on local disk.
//    Free tier (10k requests/day) is far more than a personal app needs.
//
// 2. A local JSON file (data/usage.json) — used automatically when Redis
//    env vars are absent. Fine for local dev or a single-instance VPS, but
//    will NOT work correctly on Vercel (each invocation can run on a
//    different machine with its own disk).

const DATA_DIR = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(DATA_DIR, "usage.json");

function monthKey(): string {
  const now = new Date();
  return `ai-studio:spend:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// --- File backend (fallback) ---

interface LedgerEntry {
  timestamp: string;
  costUsd: number;
}
interface Ledger {
  entries: LedgerEntry[];
}

async function readFileLedger(): Promise<Ledger> {
  try {
    const raw = await fs.readFile(LEDGER_PATH, "utf-8");
    return JSON.parse(raw) as Ledger;
  } catch {
    return { entries: [] };
  }
}

async function writeFileLedger(ledger: Ledger): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

async function getMonthlySpendFile(): Promise<number> {
  const ledger = await readFileLedger();
  return ledger.entries.filter((e) => isThisMonth(e.timestamp)).reduce((sum, e) => sum + e.costUsd, 0);
}

async function recordSpendFile(costUsd: number): Promise<void> {
  const ledger = await readFileLedger();
  ledger.entries.push({ costUsd, timestamp: new Date().toISOString() });
  await writeFileLedger(ledger);
}

// --- Public API (picks backend automatically) ---

export async function getMonthlySpend(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const val = await redis.get<number | string>(monthKey());
    return val ? Number(val) : 0;
  }
  return getMonthlySpendFile();
}

export function getMonthlyBudget(): number {
  const raw = process.env.MONTHLY_BUDGET_USD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/**
 * Throws if recording this spend would exceed the monthly budget.
 * Call this BEFORE making the paid API call.
 */
export async function assertWithinBudget(estCostUsd: number): Promise<void> {
  const spent = await getMonthlySpend();
  const budget = getMonthlyBudget();
  if (spent + estCostUsd > budget) {
    const err = new Error(
      `Monthly budget exceeded: $${spent.toFixed(2)} spent of $${budget.toFixed(2)} cap. ` +
        `This generation (~$${estCostUsd.toFixed(3)}) would go over. Try again next month, ` +
        `or raise MONTHLY_BUDGET_USD in .env.`
    );
    err.name = "BudgetExceededError";
    throw err;
  }
}

export async function recordSpend(entry: { costUsd: number; kind?: string; modelId?: string }): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.incrbyfloat(monthKey(), entry.costUsd);
    return;
  }
  await recordSpendFile(entry.costUsd);
}

export async function getUsageSummary() {
  const spent = await getMonthlySpend();
  const budget = getMonthlyBudget();
  return {
    spentUsd: Number(spent.toFixed(4)),
    budgetUsd: budget,
    remainingUsd: Number(Math.max(0, budget - spent).toFixed(4)),
    percentUsed: Math.min(100, Math.round((spent / budget) * 100)),
  };
}
