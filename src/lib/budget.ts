import { promises as fs } from "fs";
import path from "path";

// Simple file-backed spend ledger. Good enough for a single-instance
// personal deployment (a VPS, Docker box, or `next start` on one machine).
// It will NOT work correctly on stateless serverless hosts like Vercel,
// since each invocation may run on a different machine with its own disk —
// swap this for Vercel KV / Upstash Redis / a real DB if you deploy there.

const DATA_DIR = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(DATA_DIR, "usage.json");

interface LedgerEntry {
  timestamp: string;
  kind: "image" | "video" | "prompt";
  modelId: string;
  costUsd: number;
}

interface Ledger {
  entries: LedgerEntry[];
}

async function readLedger(): Promise<Ledger> {
  try {
    const raw = await fs.readFile(LEDGER_PATH, "utf-8");
    return JSON.parse(raw) as Ledger;
  } catch {
    return { entries: [] };
  }
}

async function writeLedger(ledger: Ledger): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export async function getMonthlySpend(): Promise<number> {
  const ledger = await readLedger();
  return ledger.entries
    .filter((e) => isThisMonth(e.timestamp))
    .reduce((sum, e) => sum + e.costUsd, 0);
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

export async function recordSpend(entry: Omit<LedgerEntry, "timestamp">): Promise<void> {
  const ledger = await readLedger();
  ledger.entries.push({ ...entry, timestamp: new Date().toISOString() });
  await writeLedger(ledger);
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
