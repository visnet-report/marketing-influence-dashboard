"use client";

import { useMemo, useState } from "react";
import type { Channel, Confidence, InfluencedDeal, Snapshot } from "@/lib/types";
import { inRange, isAllTime, type DateRange } from "@/lib/date-range";
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  ChannelBadge,
  ConfidenceBadge,
  MethodBadge,
  downloadCsv,
  fmtDate,
  fmtGBPFull,
} from "./ui";

type StatusFilter = "all" | "open" | "won" | "lost";

export default function DealsTable({ snapshot, range }: { snapshot: Snapshot; range: DateRange }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [confidence, setConfidence] = useState<Confidence | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const channels = useMemo(
    () => [...new Set(snapshot.deals.flatMap((d) => d.channels))],
    [snapshot.deals]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.deals.filter((d) => {
      if (!isAllTime(range) && !inRange(d.createDate, range)) return false;
      if (status === "open" && d.isClosed) return false;
      if (status === "won" && !d.isWon) return false;
      if (status === "lost" && (!d.isClosed || d.isWon)) return false;
      if (channel !== "all" && !d.channels.includes(channel)) return false;
      if (confidence !== "all" && !d.touches.some((t) => t.confidence === confidence)) return false;
      if (q && !d.companyName.toLowerCase().includes(q) && !d.dealName.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [snapshot.deals, status, channel, confidence, search, range]);

  const totalValue = filtered.reduce((s, d) => s + d.amount, 0);

  function exportCsv() {
    downloadCsv(
      `influenced-deals-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((d) => ({
        "Deal Company": d.companyName,
        "Deal Name": d.dealName,
        "Matched Contacts": [...new Set(d.touches.map((t) => t.contactName))].join("; "),
        "Match Methods": [...new Set(d.touches.map((t) => t.matchMethod))].join("; "),
        "Best Confidence": bestConfidence(d),
        "Marketing Activities": d.touches.map((t) => `${CHANNEL_LABELS[t.channel]}: ${t.detail}`).join(" | "),
        Channels: d.channels.map((c) => CHANNEL_LABELS[c]).join("; "),
        Campaigns: [...new Set(d.touches.map((t) => t.campaign).filter(Boolean))].join("; "),
        "First Activity": d.firstTouch?.date.slice(0, 10) ?? "",
        "Last Activity Before Deal": d.lastTouchBeforeCreation?.date.slice(0, 10) ?? "",
        "Last Activity": d.lastTouch?.date.slice(0, 10) ?? "",
        "Deal Created": d.createDate.slice(0, 10),
        "Deal Close Date": d.closeDate.slice(0, 10),
        "Deal Stage": d.stageLabel,
        "Deal Value (GBP)": Math.round(d.amount),
        Country: d.companyCountry,
        "Touch Count": d.touches.length,
      }))
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company or deal…"
          className="w-56 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none placeholder:text-[var(--text-dim)] focus:border-sky-500/50"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel | "all")}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
        >
          <option value="all">All channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={confidence}
          onChange={(e) => setConfidence(e.target.value as Confidence | "all")}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
        >
          <option value="all">All confidence</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[var(--text-dim)]">
            {filtered.length.toLocaleString()} deals · {fmtGBPFull(totalValue)}
          </span>
          <button
            onClick={exportCsv}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card table-scroll overflow-x-auto">
        <table className="w-full min-w-[1350px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-dim)]">
              <th className="px-3 py-2.5">Deal Company</th>
              <th className="px-3 py-2.5">Deal</th>
              <th className="px-3 py-2.5">Channels</th>
              <th className="px-3 py-2.5">Influencing Activity</th>
              <th className="px-3 py-2.5">Match</th>
              <th className="px-3 py-2.5">First Activity</th>
              <th className="px-3 py-2.5">Last Before Deal</th>
              <th className="px-3 py-2.5">Created</th>
              <th className="px-3 py-2.5">Stage</th>
              <th className="px-3 py-2.5 text-right">Value</th>
              <th className="px-3 py-2.5">Country</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((d) => (
              <Row
                key={d.dealId}
                deal={d}
                expanded={expanded === d.dealId}
                onToggle={() => setExpanded(expanded === d.dealId ? null : d.dealId)}
              />
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-[var(--text-dim)]">
                  No influenced deals match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-dim)]">
            Showing first 300 of {filtered.length.toLocaleString()} — use filters or CSV export for the full set.
          </div>
        )}
      </div>
    </div>
  );
}

function bestConfidence(d: InfluencedDeal): Confidence {
  if (d.touches.some((t) => t.confidence === "High")) return "High";
  if (d.touches.some((t) => t.confidence === "Medium")) return "Medium";
  return "Low";
}

/** Distinct activities for a deal: one entry per unique (channel, name). */
function dealActivities(deal: InfluencedDeal): { channel: Channel; name: string }[] {
  const seen = new Set<string>();
  const out: { channel: Channel; name: string }[] = [];
  for (const t of deal.touches) {
    const name = t.detail || t.campaign || CHANNEL_LABELS[t.channel];
    const key = `${t.channel}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ channel: t.channel, name });
  }
  return out;
}

function Row({
  deal,
  expanded,
  onToggle,
}: {
  deal: InfluencedDeal;
  expanded: boolean;
  onToggle: () => void;
}) {
  const methods = [...new Set(deal.touches.map((t) => t.matchMethod))];
  const activities = dealActivities(deal);
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-[var(--border)]/50 transition hover:bg-[var(--surface-2)]/60"
      >
        <td className="px-3 py-2.5 font-medium">{deal.companyName || "—"}</td>
        <td className="max-w-56 truncate px-3 py-2.5 text-[var(--text-dim)]" title={deal.dealName}>
          {deal.dealName}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {deal.channels.map((c) => (
              <ChannelBadge key={c} channel={c} />
            ))}
          </div>
        </td>
        <td className="max-w-80 px-3 py-2.5">
          {activities.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs leading-5">
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: CHANNEL_COLORS[a.channel] }}
                title={CHANNEL_LABELS[a.channel]}
              />
              <span className="truncate text-[var(--text-dim)]" title={`${CHANNEL_LABELS[a.channel]}: ${a.name}`}>
                {a.name}
              </span>
            </div>
          ))}
          {activities.length > 3 && (
            <div className="text-xs text-sky-400/80">+{activities.length - 3} more — click row</div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {methods.map((m) => (
              <MethodBadge key={m} method={m} />
            ))}
            <ConfidenceBadge value={bestConfidence(deal)} />
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(deal.firstTouch?.date ?? "")}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {fmtDate(deal.lastTouchBeforeCreation?.date ?? "")}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(deal.createDate)}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span
            className={
              deal.isWon
                ? "text-emerald-300"
                : deal.isClosed
                  ? "text-red-300"
                  : "text-sky-300"
            }
          >
            {deal.stageLabel}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
          {fmtGBPFull(deal.amount)}
        </td>
        <td className="px-3 py-2.5 text-[var(--text-dim)]">{deal.companyCountry || "—"}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--border)]/50 bg-[var(--surface-2)]/40">
          <td colSpan={11} className="px-6 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Touchpoint timeline ({deal.touches.length})
            </div>
            <div className="mt-2 space-y-1.5">
              {deal.touches.map((t, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 text-[var(--text-dim)]">{fmtDate(t.date)}</span>
                  <ChannelBadge channel={t.channel} />
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      t.timing === "before_creation"
                        ? "bg-sky-500/10 text-sky-300"
                        : "bg-violet-500/10 text-violet-300"
                    }`}
                  >
                    {t.timing === "before_creation" ? "pre-deal" : "in-flight"}
                  </span>
                  <span className="font-medium">{t.contactName}</span>
                  <span className="text-[var(--text-dim)]">{t.detail}</span>
                  <span className="ml-auto text-[var(--text-dim)]" title={t.matchEvidence}>
                    <MethodBadge method={t.matchMethod} /> <ConfidenceBadge value={t.confidence} />
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
