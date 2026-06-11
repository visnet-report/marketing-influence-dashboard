import { NextRequest, NextResponse } from "next/server";
import {
  BLOB_IMPORT_PREFIX,
  listBlobImports,
  parseEngagementCsv,
  UPLOAD_CHANNELS,
} from "@/lib/linkedin-csv";
import type { Channel } from "@/lib/types";

// CSV import management for the dashboard's Imports tab. Files are stored in
// Vercel Blob under marketing-influence/imports/<channel>/<date> <filename>
// and picked up by every sync. Protected by the dashboard's basic auth
// (middleware.ts) when DASHBOARD_PASSWORD is set.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 501 });
  }
  return NextResponse.json({ imports: await listBlobImports(), channels: UPLOAD_CHANNELS });
}

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 501 });
  }
  const filename = (req.nextUrl.searchParams.get("filename") ?? "import.csv")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 120);
  const channel = (req.nextUrl.searchParams.get("channel") ?? "linkedin_visibility") as Channel;
  if (!UPLOAD_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: `channel must be one of ${UPLOAD_CHANNELS.join(", ")}` }, { status: 400 });
  }
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const content = await req.text();
  if (!content.trim()) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (content.length > 5_000_000) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  // Validate before storing: the parser must find a company column + rows.
  const rows = parseEngagementCsv(`${date} ${filename}`, content, new Date(), channel);
  if (!rows.length) {
    return NextResponse.json(
      {
        error:
          "No company rows found. The CSV needs a 'Company Name' / 'Company' column with at least one row.",
      },
      { status: 400 }
    );
  }

  const { put } = await import("@vercel/blob");
  // The date prefix in the stored name drives the touchpoint date on sync.
  const pathname = `${BLOB_IMPORT_PREFIX}${channel}/${date} ${filename}`;
  await put(pathname, content, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/csv",
  });
  return NextResponse.json({ ok: true, pathname, rows: rows.length, channel, date });
}

export async function DELETE(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 501 });
  }
  const pathname = req.nextUrl.searchParams.get("pathname") ?? "";
  if (!pathname.startsWith(BLOB_IMPORT_PREFIX)) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 });
  }
  const { del } = await import("@vercel/blob");
  await del(pathname);
  return NextResponse.json({ ok: true });
}
