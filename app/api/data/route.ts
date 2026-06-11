import { NextResponse } from "next/server";
import { getSnapshotUrl, loadSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

// In blob mode, return the CDN URL and let the browser download the snapshot
// directly — the multi-MB payload must not pass through this function
// (serverless response limits). Locally (filesystem mode), return the
// snapshot inline.
export async function GET() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const url = await getSnapshotUrl();
    if (!url) {
      return NextResponse.json(
        { error: "No snapshot yet. Run a sync first (trigger /api/cron/sync or use Data Imports → Sync now)." },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { url: `${url}?t=${Date.now()}` },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { error: "No snapshot yet. Run a sync first (npm run sync, or npm run demo for sample data)." },
      { status: 404 }
    );
  }
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
