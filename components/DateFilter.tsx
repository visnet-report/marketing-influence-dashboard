"use client";

import { useMemo, useState } from "react";
import {
  ALL_TIME,
  buildPeriods,
  type DateRange,
  todayYmd,
} from "@/lib/date-range";

type Mode = "all" | "preset" | "month" | "quarter" | "year" | "fy" | "custom";

const MODE_LABELS: { id: Mode; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "preset", label: "Presets" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "fy", label: "Financial year" },
  { id: "custom", label: "Custom" },
];

export default function DateFilter({
  value,
  onChange,
  minDate,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  minDate: string;
}) {
  const [mode, setMode] = useState<Mode>("all");
  const [customStart, setCustomStart] = useState(minDate);
  const [customEnd, setCustomEnd] = useState(todayYmd());
  const periods = useMemo(() => buildPeriods(minDate), [minDate]);

  function selectMode(m: Mode) {
    setMode(m);
    if (m === "all") onChange(ALL_TIME);
    else if (m === "preset") onChange(periods.presets[0]);
    else if (m === "month") onChange(periods.months[0]);
    else if (m === "quarter") onChange(periods.quarters[0]);
    else if (m === "year") onChange(periods.years[0]);
    else if (m === "fy") onChange(periods.fys[0]);
    else if (m === "custom") applyCustom(customStart, customEnd);
  }

  function applyCustom(start: string, end: string) {
    if (!start || !end || start > end) return;
    onChange({
      start,
      end,
      label: `${fmt(start)} – ${fmt(end)}`,
    });
  }

  const optionList =
    mode === "preset"
      ? periods.presets
      : mode === "month"
        ? periods.months
        : mode === "quarter"
          ? periods.quarters
          : mode === "year"
            ? periods.years
            : mode === "fy"
              ? periods.fys
              : null;

  return (
    <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
      <span className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
        Period
      </span>
      <select
        value={mode}
        onChange={(e) => selectMode(e.target.value as Mode)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
      >
        {MODE_LABELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {optionList && (
        <select
          value={value.label}
          onChange={(e) => {
            const found = optionList.find((p) => p.label === e.target.value);
            if (found) onChange(found);
          }}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5"
        >
          {optionList.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      {mode === "custom" && (
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={customStart}
            min={minDate}
            max={customEnd}
            onChange={(e) => {
              setCustomStart(e.target.value);
              applyCustom(e.target.value, customEnd);
            }}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 [color-scheme:dark]"
          />
          <span className="text-[var(--text-dim)]">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            max={todayYmd()}
            onChange={(e) => {
              setCustomEnd(e.target.value);
              applyCustom(customStart, e.target.value);
            }}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 [color-scheme:dark]"
          />
        </span>
      )}

      <span className="ml-auto rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
        {value.label}
        {value.start && (
          <span className="ml-1.5 text-sky-400/70">
            {fmt(value.start)} → {fmt(value.end ?? todayYmd())}
          </span>
        )}
      </span>
    </div>
  );
}

function fmt(ymdStr: string): string {
  const d = new Date(`${ymdStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymdStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
