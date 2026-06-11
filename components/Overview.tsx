"use client";

import { useMemo, useState } from "react";
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
import type { Channel, Snapshot } from "@/lib/types";
import { inRange, isAllTime, type DateRange } from "@/lib/date-range";
import { CHANNEL_COLORS, CHANNEL_LABELS, Kpi, fmtGBP, fmtGBPFull } from "./ui";

type AttributionView = "all" | "first" | "last";

export default function Overview({ snapshot, range }: { snapshot: Snapshot; range: DateRange }) {
  const [view, setView] = useState<AttributionView>("all");
  const all = isAllTime(range);

  const deals = useMemo(
    () => (all ? snapshot.deals : snapshot.deals.filter((d) => inRange(d.createDate, range))),
    [snapshot.deals, range, all]
  );

  // Denominators (all deals created in the period, influenced or not)
  const denom = useMemo(() => {
    const t = snapshot.totals;
    if (all) {
      return {
        deals: t.deals,
        value: t.dealsValue,
        wonDeals: t.wonDeals,
        wonValue: t.wonValue,
        openDeals: t.openDeals,
        openValue: t.openValue,
      };
    }
    const acc = { deals: 0, value: 0, wonDeals: 0, wonValue: 0, openDeals: 0, openValue: 0 };
    if (snapshot.daily?.length) {
      for (const day of snapshot.daily) {
        if (!inRange(day.date, range)) continue;
        acc.deals += day.dealsCreated;
        acc.value += day.dealsValue;
        acc.wonDeals += day.wonDeals;
        acc.wonValue += day.wonValue;
        acc.openDeals += day.openDeals;
        acc.openValue += day.openValue;
      }
    } else {
      // Older snapshot without daily stats: month-granular approximation
      for (const m of snapshot.monthly) {
        if (!inRange(`${m.month}-15`, range)) continue;
        acc.deals += m.dealsCreated;
        acc.value += m.dealsValue;
      }
    }
    return acc;
  }, [snapshot, range, all]);

  // Influenced KPIs for the period
  const kpis = useMemo(() => {
    const influencedValue = deals.reduce((s, d) => s + d.amount, 0);
    const won = deals.filter((d) => d.isWon);
    const open = deals.filter((d) => !d.isClosed);
    const companies = new Set(deals.map((d) => d.companyId));
    const touchKeys = new Set<string>();
    const contactIds = new Set<string>();
    for (const d of deals) {
      for (const t of d.touches) {
        touchKeys.add(`${t.contactId}|${t.date}|${t.channel}`);
        contactIds.add(t.contactId);
      }
    }
    return {
      influenced: deals.length,
      influencedValue,
      wonDeals: won.length,
      wonValue: won.reduce((s, d) => s + d.amount, 0),
      openDeals: open.length,
      openValue: open.reduce((s, d) => s + d.amount, 0),
      companies: companies.size,
      touches: touchKeys.size,
      contacts: contactIds.size,
    };
  }, [deals]);

  // Channel breakdown for the period (all / first / last attribution)
  const channelData = useMemo(() => {
    interface Acc {
      deals: number;
      value: number;
      touches: Set<string>;
      first: number;
      firstValue: number;
      last: number;
      lastValue: number;
    }
    const map = new Map<Channel, Acc>();
    const get = (c: Channel): Acc => {
      let a = map.get(c);
      if (!a) {
        a = { deals: 0, value: 0, touches: new Set(), first: 0, firstValue: 0, last: 0, lastValue: 0 };
        map.set(c, a);
      }
      return a;
    };
    for (const d of deals) {
      for (const c of d.channels) {
        const a = get(c);
        a.deals++;
        a.value += d.amount;
      }
      for (const t of d.touches) {
        get(t.channel).touches.add(`${t.contactId}|${t.date}`);
      }
      if (d.firstTouch) {
        const a = get(d.firstTouch.channel);
        a.first++;
        a.firstValue += d.amount;
      }
      const lastAttrib = d.lastTouchBeforeCreation ?? d.lastTouch;
      if (lastAttrib) {
        const a = get(lastAttrib.channel);
        a.last++;
        a.lastValue += d.amount;
      }
    }
    return [...map.entries()]
      .map(([channel, a]) => ({
        channel,
        name: CHANNEL_LABELS[channel],
        deals: view === "all" ? a.deals : view === "first" ? a.first : a.last,
        value: view === "all" ? a.value : view === "first" ? a.firstValue : a.lastValue,
        touches: a.touches.size,
      }))
      .sort((a, b) => b.value - a.value);
  }, [deals, view]);

  // Trend chart: daily buckets for short ranges, monthly otherwise
  const trend = useMemo(() => {
    const spanDays =
      range.start && range.end
        ? (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1
        : Infinity;
    if (spanDays <= 70 && snapshot.daily?.length) {
      return {
        granularity: "day" as const,
        data: snapshot.daily
          .filter((d) => inRange(d.date, range))
          .map((d) => ({
            bucket: d.date.slice(5), // MM-DD
            "All deals": d.dealsCreated,
            "Influenced deals": d.influencedDeals,
            "Influenced value": Math.round(d.influencedValue),
          })),
      };
    }
    return {
      granularity: "month" as const,
      data: snapshot.monthly
        .filter((m) => all || rangeOverlapsMonth(m.month, range))
        .map((m) => ({
          bucket: m.month,
          "All deals": m.dealsCreated,
          "Influenced deals": m.influencedDeals,
          "Influenced value": Math.round(m.influencedValue),
        })),
    };
  }, [snapshot, range, all]);

  const pctDeals = denom.deals ? ((kpis.influenced / denom.deals) * 100).toFixed(1) : "0";
  const pctValue = denom.value ? ((kpis.influencedValue / denom.value) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi
          label="Influenced Deals"
          value={kpis.influenced.toLocaleString()}
          sub={`${pctDeals}% of ${denom.deals.toLocaleString()} deals created`}
          accent="var(--accent)"
        />
        <Kpi
          label="Influenced Pipeline"
          value={fmtGBP(kpis.influencedValue)}
          sub={`${pctValue}% of ${fmtGBP(denom.value)} total`}
          accent="var(--accent)"
        />
        <Kpi
          label="Influenced Won Revenue"
          value={fmtGBP(kpis.wonValue)}
          sub={`${kpis.wonDeals.toLocaleString()} won deals`}
          accent="var(--good)"
        />
        <Kpi
          label="Influenced Open Pipeline"
          value={fmtGBP(kpis.openValue)}
          sub={`${kpis.openDeals.toLocaleString()} open deals`}
        />
        <Kpi
          label="Influenced Companies"
          value={kpis.companies.toLocaleString()}
          sub={
            all
              ? `of ${snapshot.totals.companiesWithDeals.toLocaleString()} with deals`
              : `in ${range.label}`
          }
        />
        <Kpi
          label="Marketing Touchpoints"
          value={(all ? snapshot.totals.touchpoints : kpis.touches).toLocaleString()}
          sub={
            all
              ? `${snapshot.totals.matchedContacts.toLocaleString()}/${snapshot.totals.marketingContacts.toLocaleString()} contacts matched`
              : `${kpis.contacts.toLocaleString()} contacts touched these deals`
          }
        />
      </div>

      {/* Channel chart with attribution toggle */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Influenced deal value by channel{all ? "" : ` — ${range.label}`}
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
                  <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {channelData.map((c) => (
            <div key={c.channel} className="rounded-lg bg-[var(--surface-2)] p-2 text-xs">
              <span className="font-medium" style={{ color: CHANNEL_COLORS[c.channel] }}>
                {c.name}
              </span>
              <div className="mt-1 text-[var(--text-dim)]">
                {c.deals} deals · {fmtGBP(c.value)} · {c.touches} touches
              </div>
            </div>
          ))}
          {!channelData.length && (
            <div className="col-span-full py-4 text-center text-sm text-[var(--text-dim)]">
              No influenced deals in {range.label}.
            </div>
          )}
        </div>
      </div>

      {/* Trend */}
      <div className="card p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-dim)]">
          Deals created per {trend.granularity} — total vs marketing-influenced
          {all ? "" : ` (${range.label})`}
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend.data}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" stroke="var(--text-dim)" fontSize={12} />
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

function rangeOverlapsMonth(month: string, r: DateRange): boolean {
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  if (r.start && monthEnd < r.start) return false;
  if (r.end && monthStart > r.end) return false;
  return true;
}
