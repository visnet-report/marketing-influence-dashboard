"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { inRange, isAllTime, type DateRange } from "@/lib/date-range";
import {
  ChannelBadge,
  ConfidenceBadge,
  MethodBadge,
  downloadCsv,
  fmtDate,
  fmtGBPFull,
  CHANNEL_LABELS,
} from "./ui";

export default function CompaniesTable({ snapshot, range }: { snapshot: Snapshot; range: DateRange }) {
  const [search, setSearch] = useState("");
  const [onlyWithDeals, setOnlyWithDeals] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const all = isAllTime(range);

  // Companies with an influenced deal created in the period
  const companiesWithDealsInRange = useMemo(() => {
    if (all) return null;
    const set = new Set<string>();
    for (const d of snapshot.deals) {
      if (inRange(d.createDate, range)) set.add(d.companyId);
    }
    return set;
  }, [snapshot.deals, range, all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.companies.filter((c) => {
      if (onlyWithDeals && c.dealCount === 0) return false;
      if (q && !c.companyName.toLowerCase().includes(q)) return false;
      // Period filter: keep companies with marketing activity in the period OR
      // an influenced deal created in the period.
      if (!all) {
        const touchInRange = c.touches.some((t) => inRange(t.date, range));
        const dealInRange = companiesWithDealsInRange?.has(c.companyId) ?? false;
        if (!touchInRange && !dealInRange) return false;
      }
      return true;
    });
  }, [snapshot.companies, search, onlyWithDeals, range, all, companiesWithDealsInRange]);

  function exportCsv() {
    downloadCsv(
      `influenced-companies-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((c) => ({
        Company: c.companyName,
        Domain: c.companyDomain,
        Country: c.companyCountry,
        "Match Methods": c.matchMethods.join("; "),
        "Best Confidence": c.bestConfidence,
        Channels: c.channels.map((ch) => CHANNEL_LABELS[ch]).join("; "),
        Contacts: c.contactCount,
        Touches: c.touchCount,
        "First Touch": c.firstTouchDate.slice(0, 10),
        "Last Touch": c.lastTouchDate.slice(0, 10),
        "Total Deals": c.dealCount,
        "Influenced Deals": c.influencedDealCount,
        "Total Deal Value (GBP)": Math.round(c.totalDealValue),
        "Won Deal Value (GBP)": Math.round(c.wonDealValue),
      }))
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company…"
          className="w-56 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none placeholder:text-[var(--text-dim)] focus:border-sky-500/50"
        />
        <label className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
          <input
            type="checkbox"
            checked={onlyWithDeals}
            onChange={(e) => setOnlyWithDeals(e.target.checked)}
            className="accent-sky-400"
          />
          Only companies with deals
        </label>
        {!all && (
          <span className="text-xs text-[var(--text-dim)]">
            Showing companies with activity or influenced deals in {range.label}; deal/value columns are all-time.
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[var(--text-dim)]">{filtered.length.toLocaleString()} companies</span>
          <button
            onClick={exportCsv}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="card table-scroll overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-dim)]">
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Country</th>
              <th className="px-3 py-2.5">Channels</th>
              <th className="px-3 py-2.5">Match</th>
              <th className="px-3 py-2.5 text-right">Contacts</th>
              <th className="px-3 py-2.5 text-right">Touches</th>
              <th className="px-3 py-2.5">First / Last Touch</th>
              <th className="px-3 py-2.5 text-right">Deals (Infl.)</th>
              <th className="px-3 py-2.5 text-right">Deal Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((c) => (
              <>
                <tr
                  key={c.companyId}
                  onClick={() => setExpanded(expanded === c.companyId ? null : c.companyId)}
                  className="cursor-pointer border-b border-[var(--border)]/50 transition hover:bg-[var(--surface-2)]/60"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{c.companyName || "—"}</div>
                    {c.companyDomain && (
                      <div className="text-xs text-[var(--text-dim)]">{c.companyDomain}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-dim)]">{c.companyCountry || "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.channels.map((ch) => (
                        <ChannelBadge key={ch} channel={ch} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {c.matchMethods.map((m) => (
                        <MethodBadge key={m} method={m} />
                      ))}
                      <ConfidenceBadge value={c.bestConfidence} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">{c.contactCount}</td>
                  <td className="px-3 py-2.5 text-right">{c.touchCount}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--text-dim)]">
                    {fmtDate(c.firstTouchDate)} → {fmtDate(c.lastTouchDate)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {c.dealCount} <span className="text-sky-300">({c.influencedDealCount})</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                    {fmtGBPFull(c.totalDealValue)}
                    {c.wonDealValue > 0 && (
                      <div className="text-xs text-emerald-300">{fmtGBPFull(c.wonDealValue)} won</div>
                    )}
                  </td>
                </tr>
                {expanded === c.companyId && (
                  <tr className="border-b border-[var(--border)]/50 bg-[var(--surface-2)]/40">
                    <td colSpan={9} className="px-6 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
                        Marketing activity timeline
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {c.touches.map((t, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="w-32 shrink-0 text-[var(--text-dim)]">{fmtDate(t.date)}</span>
                            <ChannelBadge channel={t.channel} />
                            <span className="font-medium">{t.contactName}</span>
                            <span className="text-[var(--text-dim)]">{t.contactEmail}</span>
                            <span className="text-[var(--text-dim)]">{t.detail}</span>
                            <span className="ml-auto" title={t.matchEvidence}>
                              <MethodBadge method={t.matchMethod} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-dim)]">
                  No companies match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-dim)]">
            Showing first 300 of {filtered.length.toLocaleString()} — use search or CSV export for the full set.
          </div>
        )}
      </div>
    </div>
  );
}
