"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { inRange, isAllTime, type DateRange } from "@/lib/date-range";
import { ChannelBadge, METHOD_LABELS, downloadCsv, fmtDate, Kpi } from "./ui";

export default function MatchingAudit({ snapshot, range }: { snapshot: Snapshot; range: DateRange }) {
  const m = snapshot.matchMethodCounts;
  const c = snapshot.confidenceCounts;
  const all = isAllTime(range);
  const unmatched = useMemo(
    () =>
      all
        ? snapshot.unmatched
        : snapshot.unmatched.filter(
            (u) => inRange(u.firstActivity, range) || inRange(u.lastActivity, range)
          ),
    [snapshot.unmatched, range, all]
  );
  const matched = snapshot.totals.matchedContacts;
  const totalContacts = snapshot.totals.marketingContacts;
  const matchRate = totalContacts ? ((matched / totalContacts) * 100).toFixed(1) : "0";

  function exportUnmatched() {
    downloadCsv(
      `unmatched-marketing-contacts-${new Date().toISOString().slice(0, 10)}.csv`,
      unmatched.map((u) => ({
        Contact: u.contactName,
        Email: u.contactEmail,
        "Company (as typed)": u.contactCompanyText,
        Channels: u.channels.join("; "),
        "First Activity": u.firstActivity?.slice(0, 10) ?? "",
        "Last Activity": u.lastActivity?.slice(0, 10) ?? "",
        Touches: u.touchCount,
        Reason: u.reason,
      }))
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Match Rate"
          value={`${matchRate}%`}
          sub={`${matched} of ${totalContacts} marketing contacts (all-time)`}
          accent="var(--accent)"
        />
        <Kpi label="High Confidence" value={c.High.toLocaleString()} accent="var(--good)" />
        <Kpi label="Medium Confidence" value={c.Medium.toLocaleString()} accent="var(--warn)" />
        <Kpi label="Low Confidence" value={c.Low.toLocaleString()} accent="var(--bad)" />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Match method breakdown
        </h2>
        <div className="space-y-2">
          {(Object.keys(METHOD_LABELS) as (keyof typeof METHOD_LABELS)[]).map((method) => {
            const count = m[method] ?? 0;
            const pct = matched ? (count / matched) * 100 : 0;
            return (
              <div key={method} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">{METHOD_LABELS[method]}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded bg-sky-500/60"
                    style={{ width: `${Math.max(pct, count ? 2 : 0)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-[var(--text-dim)]">
                  {count} ({pct.toFixed(0)}%)
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--text-dim)]">
          <strong>Company ID</strong> = HubSpot contact→company association. <strong>Email Domain</strong> = corporate
          email domain equals a company domain/website (free providers like Gmail excluded).{" "}
          <strong>Exact Name</strong> = identical after removing suffixes (Ltd, Limited, LLC, Inc, Group, Holdings,
          The, Plc, Services, Solutions, …). <strong>Fuzzy Name</strong> = similarity ≥{" "}
          {snapshot.config.fuzzyThreshold} with country/domain corroboration adjusting confidence. Influence window:
          touches up to {snapshot.config.lookbackDays} days before deal creation, halted at the close date for
          closed deals; open deals keep accumulating touches.
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Unmatched marketing-engaged contacts ({unmatched.length}
            {all ? "" : ` in ${range.label}`})
          </h2>
          <button
            onClick={exportUnmatched}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20"
          >
            Export CSV
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-dim)]">
          These contacts engaged with marketing but couldn't be matched to a CRM company — review them for new
          business signals or data-quality fixes (e.g. add company domains in HubSpot).
        </p>
        <div className="table-scroll max-h-96 overflow-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-dim)]">
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Company (as typed)</th>
                <th className="px-3 py-2">Channels</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((u) => (
                <tr key={u.contactId} className="border-b border-[var(--border)]/50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.contactName}</div>
                    <div className="text-xs text-[var(--text-dim)]">{u.contactEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-dim)]">{u.contactCompanyText || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.channels.map((ch) => (
                        <ChannelBadge key={ch} channel={ch} />
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-dim)]">
                    {fmtDate(u.firstActivity)} → {fmtDate(u.lastActivity)} ({u.touchCount})
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-dim)]">{u.reason}</td>
                </tr>
              ))}
              {!unmatched.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-dim)]">
                    {all
                      ? "Every marketing-engaged contact was matched 🎉"
                      : `No unmatched contacts with activity in ${range.label}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
