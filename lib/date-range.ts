// ── Date range model for the dashboard's period selector ─────────────────────
// All boundaries are inclusive YYYY-MM-DD strings; null = unbounded.
// Financial year follows the UK convention (April–March) by default; override
// with NEXT_PUBLIC_FY_START_MONTH (1–12).

export interface DateRange {
  start: string | null;
  end: string | null;
  label: string;
}

export const ALL_TIME: DateRange = { start: null, end: null, label: "All time" };

export const FY_START_MONTH = Math.min(
  12,
  Math.max(1, Number(process.env.NEXT_PUBLIC_FY_START_MONTH ?? 4))
);

export function isAllTime(r: DateRange): boolean {
  return !r.start && !r.end;
}

/** Inclusive day-granular containment for an ISO date/datetime string. */
export function inRange(iso: string, r: DateRange): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (r.start && d < r.start) return false;
  if (r.end && d > r.end) return false;
  return true;
}

// ── Construction helpers (UTC-based to avoid timezone drift) ─────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function todayYmd(): string {
  const now = new Date();
  return ymd(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

export function monthRange(year: number, month: number): DateRange {
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start: ymd(year, month, 1), end: ymd(year, month, lastDayOfMonth(year, month)), label: name };
}

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    start: ymd(year, startMonth, 1),
    end: ymd(year, endMonth, lastDayOfMonth(year, endMonth)),
    label: `Q${quarter} ${year}`,
  };
}

export function yearRange(year: number): DateRange {
  return { start: ymd(year, 1, 1), end: ymd(year, 12, 31), label: String(year) };
}

/** Financial year starting in `startYear` (e.g. 2025 → Apr 2025 – Mar 2026). */
export function fyRange(startYear: number): DateRange {
  const endYear = FY_START_MONTH === 1 ? startYear : startYear + 1;
  const endMonth = FY_START_MONTH === 1 ? 12 : FY_START_MONTH - 1;
  const label =
    FY_START_MONTH === 1
      ? `FY ${startYear}`
      : `FY ${startYear}/${String(endYear).slice(-2)}`;
  return {
    start: ymd(startYear, FY_START_MONTH, 1),
    end: ymd(endYear, endMonth, lastDayOfMonth(endYear, endMonth)),
    label,
  };
}

export function trailingDays(days: number, label: string): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 3600 * 1000);
  return {
    start: ymd(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    end: ymd(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
    label,
  };
}

/** FY start-year that contains the given date. */
export function fyStartYearOf(year: number, month: number): number {
  return month >= FY_START_MONTH ? year : year - 1;
}

export interface PresetGroups {
  presets: DateRange[];
  months: DateRange[];
  quarters: DateRange[];
  years: DateRange[];
  fys: DateRange[];
}

/** Build every selectable period between minDate (YYYY-MM-DD) and today. */
export function buildPeriods(minDate: string): PresetGroups {
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  const minY = Number(minDate.slice(0, 4)) || curY;
  const minM = Number(minDate.slice(5, 7)) || 1;

  const lastMonthY = curM === 1 ? curY - 1 : curY;
  const lastMonthM = curM === 1 ? 12 : curM - 1;
  const curQ = (Math.ceil(curM / 3)) as 1 | 2 | 3 | 4;
  const lastQ = curQ === 1 ? 4 : ((curQ - 1) as 1 | 2 | 3 | 4);
  const lastQY = curQ === 1 ? curY - 1 : curY;
  const curFy = fyStartYearOf(curY, curM);

  const presets: DateRange[] = [
    { ...monthRange(curY, curM), label: "This month" },
    { ...monthRange(lastMonthY, lastMonthM), label: "Last month" },
    { ...quarterRange(curY, curQ), label: "This quarter" },
    { ...quarterRange(lastQY, lastQ), label: "Last quarter" },
    { ...fyRange(curFy), label: `This FY (${fyRange(curFy).label})` },
    { ...fyRange(curFy - 1), label: `Last FY (${fyRange(curFy - 1).label})` },
    { ...yearRange(curY), label: `This year (${curY})` },
    { ...yearRange(curY - 1), label: `Last year (${curY - 1})` },
    trailingDays(30, "Last 30 days"),
    trailingDays(90, "Last 90 days"),
    trailingDays(365, "Last 12 months"),
  ];

  const months: DateRange[] = [];
  for (let y = curY; y >= minY; y--) {
    const from = y === curY ? curM : 12;
    const to = y === minY ? minM : 1;
    for (let m = from; m >= to; m--) months.push(monthRange(y, m));
  }

  const quarters: DateRange[] = [];
  for (let y = curY; y >= minY; y--) {
    const from = y === curY ? curQ : 4;
    const to = y === minY ? Math.ceil(minM / 3) : 1;
    for (let q = from; q >= to; q--) quarters.push(quarterRange(y, q as 1 | 2 | 3 | 4));
  }

  const years: DateRange[] = [];
  for (let y = curY; y >= minY; y--) years.push(yearRange(y));

  const fys: DateRange[] = [];
  const minFy = fyStartYearOf(minY, minM);
  for (let y = curFy; y >= minFy; y--) fys.push(fyRange(y));

  return { presets, months, quarters, years, fys };
}
