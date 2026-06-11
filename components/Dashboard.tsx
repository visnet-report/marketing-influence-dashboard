"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { ALL_TIME, todayYmd, type DateRange } from "@/lib/date-range";
import Overview from "./Overview";
import DealsTable from "./DealsTable";
import CompaniesTable from "./CompaniesTable";
import MatchingAudit from "./MatchingAudit";
import DateFilter from "./DateFilter";
import { fmtDateTime } from "./ui";

type Tab = "overview" | "deals" | "companies" | "matching";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deals", label: "Influenced Deals" },
  { id: "companies", label: "Companies" },
  { id: "matching", label: "Matching Audit" },
];

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<DateRange>(ALL_TIME);

  useEffect(() => {
    fetch("/api/data")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to load data (${res.status})`);
        }
        return res.json();
      })
      .then(setSnapshot)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Shell>
        <div className="card mx-auto mt-16 max-w-xl p-8 text-center">
          <div className="text-lg font-semibold">No data yet</div>
          <p className="mt-2 text-sm text-[var(--text-dim)]">{error}</p>
          <p className="mt-4 text-xs text-[var(--text-dim)]">
            Run <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">npm run sync</code> (live HubSpot
            data) or <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">npm run demo</code> (sample
            data), then refresh.
          </p>
        </div>
      </Shell>
    );
  }

  if (!snapshot) {
    return (
      <Shell>
        <div className="mt-24 flex flex-col items-center gap-3 text-[var(--text-dim)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-sky-400" />
          Loading dashboard…
        </div>
      </Shell>
    );
  }

  const minDate =
    snapshot.daily?.[0]?.date ??
    (snapshot.monthly[0] ? `${snapshot.monthly[0].month}-01` : todayYmd());

  return (
    <Shell generatedAt={snapshot.generatedAt}>
      <nav className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-sky-500/15 text-sky-300"
                : "text-[var(--text-dim)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="mb-6">
        <DateFilter value={range} onChange={setRange} minDate={minDate} />
      </div>
      {tab === "overview" && <Overview snapshot={snapshot} range={range} />}
      {tab === "deals" && <DealsTable snapshot={snapshot} range={range} />}
      {tab === "companies" && <CompaniesTable snapshot={snapshot} range={range} />}
      {tab === "matching" && <MatchingAudit snapshot={snapshot} range={range} />}
    </Shell>
  );
}

function Shell({ children, generatedAt }: { children: React.ReactNode; generatedAt?: string }) {
  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Marketing Influence <span className="text-sky-400">Dashboard</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--text-dim)]">
            Marketing contribution to pipeline & deals — HubSpot deal companies × marketing touchpoints
          </p>
        </div>
        {generatedAt && (
          <div className="text-xs text-[var(--text-dim)]">
            Data refreshed: <span className="text-[var(--text)]">{fmtDateTime(generatedAt)}</span> · syncs daily
            04:30 UK
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
