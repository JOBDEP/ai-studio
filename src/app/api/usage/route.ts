import { NextResponse } from "next/server";
import { getUsageSummary } from "@/lib/budget";

export async function GET() {
  const summary = await getUsageSummary();
  return NextResponse.json(summary);
}
