import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

// Manual sync trigger for the dashboard's "Sync now" button (e.g. right after
// uploading a CSV). Protected by the dashboard's basic auth via middleware.ts
// — unlike /api/cron/sync, which authenticates with CRON_SECRET instead.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Manual sync failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
