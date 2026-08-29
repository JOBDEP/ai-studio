"use client";

import { useEffect, useState } from "react";

interface Usage {
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  percentUsed: number;
}

export default function BudgetMeter({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [refreshKey]);

  if (!usage) return null;

  const barColor =
    usage.percentUsed >= 90 ? "bg-red-500" : usage.percentUsed >= 60 ? "bg-yellow-500" : "bg-accent";

  return (
    <div className="w-full max-w-xs">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>This month&apos;s spend</span>
        <span>
          ${usage.spentUsd.toFixed(2)} / ${usage.budgetUsd.toFixed(2)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-panel border border-border overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${usage.percentUsed}%` }} />
      </div>
    </div>
  );
}
