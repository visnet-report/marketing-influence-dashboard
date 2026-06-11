"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Snapshot } from "@/lib/types";
import { CHANNEL_COLORS, CHANNEL_LABELS, Kpi, fmtGBP, fmtGBPFull } from "./ui";

type AttributionView = "all" | "first" | "last";

export default function Overview({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<AttributionView>("all");
  const t = snapshot.totals;
  const pctDeals = t.deals ? ((t.influencedDeals / t.deals) * 100).toFixed(1) : "0";
  const pctValue = t.dealsValue ? ((t.influencedValue / t.dealsValue) * 100).toFixed(1) : "0";

  const channelData = snapshot.channels.map((c) => ({
    name: CHANNEL_LABELS[c.channel],
    channel: c.channel,
    deals: view === "all" ? c.influencedDeals : view === "first" ? c.firstTouchDeals : c.lastTouchDeals,
    value: view === "all" ? c.influencedValue : view === "first" ? c.firstTouchValue : c.lastTouchValue,
    touches: c.touches,
  }));

  const monthlyData = snapshot.monthly.map((m) => ({
    month: m.month,
    "All deals": m.dealsCreated,
    "Influenced deals": m.influencedDeals,
    "Influenced value": Math.round(m.influencedValue),
  }));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi
          label="Influenced Deals"
          value={t.influencedDeals.toLocaleString()}
          sub={`${pctDeals}% of ${t.deals.toLocaleString()} deals`}
          accent="var(--accent)"
        />
        <Kpi
          label="Influenced Pipeline"
          value={fmtGBP(t.influencedValue)}
          sub={`${pctValue}% of ${fmtGBP(t.dealsValue)} total`}
          accent="var(--accent)"
        />
        <Kpi
          label="Influenced Won Revenue"
          value={fmtGBP(t.influencedWonValue)}
          sub={`${t.influencedWonDeals.toLocaleString()} won deals`}
          accent="var(--good)"
        />
        <Kpi
          label="Influenced Open Pipeline"
          value={fmtGBP(t.influencedOpenValue)}
          sub={`${t.influencedOpenDeals.toLocaleString()} open deals`}
        />
        <Kpi
          label="Influenced Companies"
          value={t.influencedCompanies.toLocaleString()}
          sub={`of ${t.companiesWithDeals.toLocaleString()} with deals`}
        />
        <Kpi
          label="Marketing Touchpoints"
          value={t.touchpoints.toLocaleString()}
          sub={`${t.matchedContacts.toLocaleString()}/${t.marketingContacts.toLocaleString()} contacts matched`}
        />
      </div>

      {/* Channel chart with attribution toggle */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Influenced deal value by channel
          </h2>
          <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-1 text-xs">
            {(
              [
                ["all", "All-touch"],
                ["first", "First-touch"],
                ["last", "Last-touch"],
              ] as [AttributionView, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`rounded-md px-3 py-1.5 transition ${
                  view === key ? "bg-sky-500/20 text-sky-300" : "text-[var(--text-dim)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-4 text-xs text-[var(--text-dim)]">
          {view === "all" &&
            "Every channel that touched the company before the deal closed gets full credit (deals appear in multiple channels)."}
          {view === "first" && "Credit goes to the channel of the earliest eligible touchpoint."}
          {view === "last" &&
            "Credit goes to the channel of the last touchpoint before deal creation (falls back to last eligible touch)."}
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channelData} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtGBP(v)}
                stroke="var(--text-dim)"
                fontSize={12}
              />
              <YAxis type="category" dataKey="name" width={160} stroke="var(--text-dim)" fontSize={12} />
              <Tooltip
                cursor={{ fill: "rgba(56,189,248,0.06)" }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                }}
                formatter={(value: number, name: string) =>
                  name === "value" ? [fmtGBPFull(value), "Deal value"] : [value, name]
                }
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {channelData.map((entry) => (
                  <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel as keyof typeof CHANNEL_COLORS]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {channelData.map((c) => (
            <div key={c.channel} className="rounded-lg bg-[var(--surface-2)] p-2 text-xs">
              <span className="font-medium" style={{ color: CHANNEL_COLORS[c.channel as keyof typeof CHANNEL_COLORS] }}>
                {c.name}
              </span>
              <div className="mt-1 text-[var(--text-dim)]">
                {c.deals} deals · {fmtGBP(c.value)} · {c.touches} touches
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly trend */}
      <div className="card p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Deals created per month — total vs marketing-influenced
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-dim)" fontSize={12} />
              <YAxis yAxisId="count" stroke="var(--text-dim)" fontSize={12} />
              <YAxis
                yAxisId="value"
                orientation="right"
                tickFormatter={(v) => fmtGBP(v)}
                stroke="var(--text-dim)"
                fontSize={12}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                }}
                formatter={(value: number, name: string) =>
                  name === "Influenced value" ? [fmtGBPFull(value), name] : [value, name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="count" dataKey="All deals" fill="#334766" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="count" dataKey="Influenced deals" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="Influenced value"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
