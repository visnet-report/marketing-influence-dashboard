// ── Snapshot storage ───────────────────────────────────────────────────────────
// Vercel Blob in production (BLOB_READ_WRITE_TOKEN present), local filesystem
// otherwise. A single JSON snapshot is overwritten on each sync.

import type { Snapshot } from "./types";

const SNAPSHOT_PATH = "marketing-influence/snapshot.json";
const LOCAL_FILE = "data/snapshot.json";

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const json = JSON.stringify(snapshot);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    await put(SNAPSHOT_PATH, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } else {
    const { mkdir, writeFile } = await import("fs/promises");
    const { dirname, join } = await import("path");
    const file = join(process.cwd(), LOCAL_FILE);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, json, "utf8");
  }
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { head } = await import("@vercel/blob");
      const meta = await head(SNAPSHOT_PATH);
      const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as Snapshot;
    } catch {
      return null;
    }
  }
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const json = await readFile(join(process.cwd(), LOCAL_FILE), "utf8");
    return JSON.parse(json) as Snapshot;
  } catch {
    return null;
  }
}
