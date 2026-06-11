import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

// Daily full sync, triggered by Vercel Cron (see vercel.json) or manually with
// GET /api/cron/sync + Authorization: Bearer <CRON_SECRET>.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Sync failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
