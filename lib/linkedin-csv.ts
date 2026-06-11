// ── LinkedIn Company Engagement Report ingest ─────────────────────────────────
// Reads CSV exports from LinkedIn Campaign Manager (Plan → Audiences → company
// list → Company Engagement Report) placed in the imports/ directory. Each row
// becomes a COMPANY-LEVEL visibility touchpoint (impressions / ad engagement /
// organic engagement), matched to CRM companies by domain or cleaned/fuzzy name
// through the same engine used for contacts.
//
// Parsing is deliberately flexible: any CSV with a recognizable company-name
// column works. The touch date comes from a YYYY-MM-DD prefix or suffix in the
// filename (e.g. "2026-06-01 linkedin-engagement.csv"), falling back to the
// file's modified time.

export interface CompanyLevelTouch {
  companyName: string;
  domain: string;
  date: string; // ISO
  detail: string;
  campaign: string;
}

const NAME_COLUMNS = ["company name", "companyname", "company", "account", "company page", "organization"];
const DOMAIN_COLUMNS = ["domain", "website", "company domain", "website url", "company website"];
const CAMPAIGN_COLUMNS = ["campaign", "campaign name", "campaign group", "audience", "segment"];
/** Metric columns surfaced in the touch detail, in display order. */
const METRIC_COLUMNS = [
  "engagement level",
  "targeted",
  "impressions",
  "paid impressions",
  "clicks",
  "ad engagement",
  "organic engagement",
  "engagement rate",
  "website visits",
  "members engaged",
];

/** Minimal CSV parser handling quoted fields, commas, and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function dateFromFilename(filename: string, fallback: Date): string {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback.toISOString();
}

export function parseEngagementCsv(
  filename: string,
  content: string,
  mtime: Date
): CompanyLevelTouch[] {
  const rows = parseCsv(content);
  if (rows.length < 2) return [];
  // LinkedIn exports sometimes prepend report-metadata lines before the real
  // header — scan the first 10 rows for one containing a company-name column.
  let headerIdx = -1;
  let nameCol = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const col = findColumn(rows[i], NAME_COLUMNS);
    if (col >= 0) {
      headerIdx = i;
      nameCol = col;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const headers = rows[headerIdx].map((h) => h.trim());
  const domainCol = findColumn(headers, DOMAIN_COLUMNS);
  const campaignCol = findColumn(headers, CAMPAIGN_COLUMNS);
  const metricCols = headers
    .map((h, i) => ({ header: h, index: i }))
    .filter(({ header }) => METRIC_COLUMNS.includes(header.toLowerCase()));
  const date = dateFromFilename(filename, mtime);
  const campaignFromFile = filename
    .replace(/\.csv$/i, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[-_]+/g, " ")
    .trim();

  const touches: CompanyLevelTouch[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const name = (row[nameCol] ?? "").trim();
    if (!name || name.toLowerCase() === "total") continue;
    const metrics = metricCols
      .map(({ header, index }) => {
        const v = (row[index] ?? "").trim();
        return v ? `${header}: ${v}` : "";
      })
      .filter(Boolean)
      .join(", ");
    touches.push({
      companyName: name,
      domain: domainCol >= 0 ? (row[domainCol] ?? "").trim() : "",
      date,
      detail: metrics ? `LinkedIn company engagement — ${metrics}` : "LinkedIn company engagement",
      campaign: campaignCol >= 0 && row[campaignCol]?.trim() ? row[campaignCol].trim() : campaignFromFile,
    });
  }
  return touches;
}

/** Load all CSVs from the imports/ directory (skips *.sample.csv). */
export async function loadCompanyEngagementCsvs(): Promise<CompanyLevelTouch[]> {
  try {
    const { readdir, readFile, stat } = await import("fs/promises");
    const { join } = await import("path");
    const dir = join(process.cwd(), "imports");
    const files = (await readdir(dir)).filter(
      (f) => f.toLowerCase().endsWith(".csv") && !f.toLowerCase().includes(".sample.")
    );
    const all: CompanyLevelTouch[] = [];
    for (const file of files) {
      const full = join(dir, file);
      const [content, info] = await Promise.all([readFile(full, "utf8"), stat(full)]);
      const touches = parseEngagementCsv(file, content, info.mtime);
      console.log(`imports/${file}: ${touches.length} company engagement rows`);
      all.push(...touches);
    }
    return all;
  } catch {
    return []; // no imports directory — feature simply inactive
  }
}
