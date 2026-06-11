"use client";

import type { Channel, Confidence, MatchMethod } from "@/lib/types";

export const CHANNEL_LABELS: Record<Channel, string> = {
  form_submission: "Form Submissions",
  paid_search: "Paid Search",
  paid_social: "Paid LinkedIn (Contact)",
  organic_social: "Organic LinkedIn (Contact)",
  organic_search: "Organic Search",
  email_marketing: "Email Marketing",
  referral: "Referrals",
  ai_referral: "AI Referrals",
  direct: "Direct",
  linkedin_visibility: "Paid LinkedIn Visibility (Company)",
  organic_social_visibility: "Organic LinkedIn Visibility (Company)",
  other: "Other Campaigns",
};

export const CHANNEL_COLORS: Record<Channel, string> = {
  form_submission: "#38bdf8",
  paid_search: "#fbbf24",
  paid_social: "#818cf8",
  organic_social: "#34d399",
  organic_search: "#2dd4bf",
  email_marketing: "#f472b6",
  referral: "#a3e635",
  ai_referral: "#e879f9",
  direct: "#94a3b8",
  linkedin_visibility: "#60a5fa",
  organic_social_visibility: "#4ade80",
  other: "#c084fc",
};

export const METHOD_LABELS: Record<MatchMethod, string> = {
  company_id: "Company ID",
  email_domain: "Email Domain",
  exact_name: "Exact Name",
  fuzzy_name: "Fuzzy Name",
};

export function fmtGBP(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}m`;
  if (Math.abs(n) >= 10_000) return `£${Math.round(n / 1000)}k`;
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export function fmtGBPFull(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  const styles: Record<Confidence, string> = {
    High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Low: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[value]}`}>
      {value}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${CHANNEL_COLORS[channel]}22`, color: CHANNEL_COLORS[channel] }}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

export function MethodBadge({ method }: { method: MatchMethod }) {
  const high = method === "company_id" || method === "email_domain";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${
        high
          ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
          : "border-slate-500/30 bg-slate-500/10 text-slate-300"
      }`}
    >
      {METHOD_LABELS[method]}
    </span>
  );
}

export function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--text-dim)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-[var(--text-dim)]">{sub}</div> : null}
    </div>
  );
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
