"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/types";
import { ChannelBadge, fmtDateTime } from "./ui";

interface BlobImport {
  pathname: string;
  filename: string;
  channel: Channel;
  uploadedAt: string;
  size: number;
}

const CHANNEL_OPTIONS: { value: Channel; label: string; hint: string }[] = [
  {
    value: "linkedin_visibility",
    label: "Paid LinkedIn Visibility (Company)",
    hint: "Campaign Manager → Company Engagement Report export (paid impressions + ad engagement). Note: the LinkedIn Ads API already feeds this channel automatically — upload only for periods/accounts the API doesn't cover.",
  },
  {
    value: "organic_social_visibility",
    label: "Organic LinkedIn Visibility (Company)",
    hint: "Companies that saw/engaged organic social content — HubSpot Buyer Intent view exports, engager lists. Tip: a HubSpot intent LIST can feed this automatically (HUBSPOT_LIST_TOUCHES, see README).",
  },
];

export default function ImportsPanel({ onDataChanged }: { onDataChanged: () => void }) {
  const [imports, setImports] = useState<BlobImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("linkedin_visibility");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    fetch("/api/imports")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setImports(data.imports);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  async function upload(file: File) {
    setBusy("Uploading…");
    setNotice(null);
    try {
      const content = await file.text();
      const qs = new URLSearchParams({ filename: file.name, channel, date });
      const res = await fetch(`/api/imports?${qs}`, { method: "POST", body: content });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(
        `Uploaded ${file.name}: ${data.rows} company rows as ${labelOf(channel)} dated ${data.date}. ` +
          `Click "Sync now" to recalculate influence.`
      );
      refresh();
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(pathname: string) {
    setBusy("Deleting…");
    try {
      const res = await fetch(`/api/imports?pathname=${encodeURIComponent(pathname)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice(`Deleted. Click "Sync now" to recalculate without it.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("Syncing — pulling HubSpot + imports, recalculating influence (1–2 min)…");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/sync-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(
        `Sync complete in ${Math.round(data.durationMs / 1000)}s — ${data.counts.influencedDeals.toLocaleString()} influenced deals. Reloading dashboard data…`
      );
      onDataChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Upload company engagement data
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-dim)]">
          Upload CSVs of companies that engaged with marketing outside HubSpot — LinkedIn Company
          Engagement Reports, organic post engager lists, event attendee companies. Rows are matched to
          CRM companies (domain → exact → fuzzy name) and become touchpoints in the influence model. The
          CSV needs a <code className="rounded bg-[var(--surface-2)] px-1">Company Name</code> (or{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">Company</code>) column; optional columns
          like <code className="rounded bg-[var(--surface-2)] px-1">Domain</code>,{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">Campaign</code>,{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">Impressions</code>,{" "}
          <code className="rounded bg-[var(--surface-2)] px-1">Engagement Level</code> improve matching and
          detail.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]"
            >
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
            Activity date (when this engagement happened)
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)] [color-scheme:dark]"
            />
          </label>
          <label className="cursor-pointer rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/20">
            Choose CSV…
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </label>
          <button
            onClick={syncNow}
            disabled={!!busy}
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Sync now
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-dim)]">
          {CHANNEL_OPTIONS.find((c) => c.value === channel)?.hint}
        </p>
        {busy && (
          <div className="mt-3 flex items-center gap-2 text-sm text-sky-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-sky-400" />
            {busy}
          </div>
        )}
        {notice && <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm text-emerald-300">{notice}</div>}
        {error && <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">{error}</div>}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Uploaded files {imports ? `(${imports.length})` : ""}
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-dim)]">
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Channel</th>
              <th className="px-3 py-2">Uploaded</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(imports ?? []).map((f) => (
              <tr key={f.pathname} className="border-b border-[var(--border)]/50">
                <td className="px-3 py-2 font-medium">{f.filename}</td>
                <td className="px-3 py-2">
                  <ChannelBadge channel={f.channel} />
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-dim)]">{fmtDateTime(f.uploadedAt)}</td>
                <td className="px-3 py-2 text-right text-xs text-[var(--text-dim)]">
                  {(f.size / 1024).toFixed(1)} KB
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => remove(f.pathname)}
                    disabled={!!busy}
                    className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {imports && !imports.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--text-dim)]">
                  No uploads yet. Files added here are included in every sync (daily 04:30 UK, or "Sync
                  now").
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelOf(c: Channel): string {
  return CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c;
}
