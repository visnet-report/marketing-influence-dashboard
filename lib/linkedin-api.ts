// ── LinkedIn Advertising API integration ──────────────────────────────────────
// Pulls company-level ad visibility (impressions/clicks/engagements by member
// company) straight from the LinkedIn Ads reporting API, replacing the manual
// Company Engagement Report CSV export for the PAID side.
//
// Requirements (one-time setup, see README):
//   1. LinkedIn Developer app with the Advertising API product approved
//      (Development tier is enough — it includes read-only reporting).
//   2. A member OAuth token with r_ads + r_ads_reporting scopes
//      (run `npm run linkedin-auth` to obtain one).
//
// Env vars:
//   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET  – app credentials
//   LINKEDIN_REFRESH_TOKEN                       – long-lived (≈1 yr) token;
//                                                  exchanged for access tokens
//   LINKEDIN_ACCESS_TOKEN                        – alternative: direct token
//   LINKEDIN_AD_ACCOUNT_ID                       – numeric sponsored account id
//   LINKEDIN_API_VERSION                         – default 202601
//   LINKEDIN_VISIBILITY_LOOKBACK_DAYS            – default 30
//   LINKEDIN_MIN_IMPRESSIONS                     – ignore rows below (default 5;
//                                                  LinkedIn adds ±3 noise/day)
//
// Organic note: LinkedIn exposes NO API for which companies engaged with
// organic posts. The CSV import (imports/) remains the only organic
// company-level source.

import type { CompanyLevelTouch } from "./linkedin-csv";

const API = "https://api.linkedin.com";

export function linkedInConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_AD_ACCOUNT_ID &&
      (process.env.LINKEDIN_ACCESS_TOKEN ||
        (process.env.LINKEDIN_REFRESH_TOKEN &&
          process.env.LINKEDIN_CLIENT_ID &&
          process.env.LINKEDIN_CLIENT_SECRET))
  );
}

async function getAccessToken(): Promise<string> {
  if (process.env.LINKEDIN_REFRESH_TOKEN && process.env.LINKEDIN_CLIENT_ID) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.LINKEDIN_REFRESH_TOKEN,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    });
    const res = await fetch(`https://www.linkedin.com/oauth/v2/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) return data.access_token as string;
    } else {
      console.warn(`LinkedIn token refresh failed (${res.status}); falling back to LINKEDIN_ACCESS_TOKEN`);
    }
  }
  const direct = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!direct) throw new Error("No usable LinkedIn access token");
  return direct;
}

function liHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": process.env.LINKEDIN_API_VERSION ?? "202601",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function dateParam(d: Date): string {
  return `(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()})`;
}

interface AnalyticsRow {
  impressions?: number;
  clicks?: number;
  totalEngagements?: number;
  pivotValues?: string[];
  dateRange?: { start?: { year: number; month: number; day: number } };
}

/** Resolve organization URNs → { name, domain } with batching + caching. */
async function resolveOrganizations(
  token: string,
  urns: string[]
): Promise<Map<string, { name: string; domain: string }>> {
  const out = new Map<string, { name: string; domain: string }>();
  const ids = [...new Set(urns.map((u) => u.split(":").pop()!).filter(Boolean))];
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const url = `${API}/rest/organizationsLookup?ids=List(${chunk.join(",")})`;
    const res = await fetch(url, { headers: liHeaders(token) });
    if (!res.ok) {
      // Name resolution can be permission-gated; fall back to bare URN labels
      // rather than failing the whole sync.
      console.warn(`organizationsLookup failed (${res.status}); using URN ids as names`);
      for (const id of chunk) out.set(id, { name: `LinkedIn org ${id}`, domain: "" });
      continue;
    }
    const data = await res.json();
    const results = data.results ?? {};
    for (const id of chunk) {
      const org = results[id];
      const name = org?.localizedName ?? org?.name?.localized?.en_US ?? `LinkedIn org ${id}`;
      let domain = "";
      const site: string | undefined =
        org?.localizedWebsite ?? org?.websiteUrl ?? org?.website?.localized?.en_US;
      if (site) domain = site;
      out.set(id, { name, domain });
    }
  }
  return out;
}

/**
 * Fetch impressions/clicks/engagements pivoted by MEMBER_COMPANY at daily
 * granularity for the configured ad account, and convert each (company, day)
 * row into a company-level visibility touchpoint.
 */
export async function fetchLinkedInCompanyVisibility(): Promise<CompanyLevelTouch[]> {
  if (!linkedInConfigured()) return [];
  const token = await getAccessToken();
  const accountId = process.env.LINKEDIN_AD_ACCOUNT_ID!;
  const lookbackDays = Number(process.env.LINKEDIN_VISIBILITY_LOOKBACK_DAYS ?? 30);
  const minImpressions = Number(process.env.LINKEDIN_MIN_IMPRESSIONS ?? 5);
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 3600 * 1000);

  const qs = [
    "q=statistics",
    "pivots=List(MEMBER_COMPANY)",
    "timeGranularity=DAILY",
    `dateRange=(start:${dateParam(start)},end:${dateParam(end)})`,
    `accounts=List(${encodeURIComponent(`urn:li:sponsoredAccount:${accountId}`)})`,
    "fields=impressions,clicks,totalEngagements,pivotValues,dateRange",
  ].join("&");

  const rows: AnalyticsRow[] = [];
  let startIdx = 0;
  const COUNT = 1000;
  // adAnalytics uses index pagination; loop until a short page comes back.
  for (;;) {
    const res = await fetch(`${API}/rest/adAnalytics?${qs}&start=${startIdx}&count=${COUNT}`, {
      headers: liHeaders(token),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LinkedIn adAnalytics ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = await res.json();
    const page: AnalyticsRow[] = data.elements ?? [];
    rows.push(...page);
    if (page.length < COUNT) break;
    startIdx += COUNT;
  }

  const companyRows = rows.filter(
    (r) => (r.impressions ?? 0) >= minImpressions && r.pivotValues?.length
  );
  const orgMap = await resolveOrganizations(
    token,
    companyRows.flatMap((r) => r.pivotValues ?? [])
  );

  const touches: CompanyLevelTouch[] = [];
  for (const row of companyRows) {
    const urnId = row.pivotValues![0].split(":").pop()!;
    const org = orgMap.get(urnId);
    if (!org) continue;
    const s = row.dateRange?.start;
    const date = s
      ? new Date(Date.UTC(s.year, s.month - 1, s.day, 12)).toISOString()
      : new Date().toISOString();
    const metrics = [
      `impressions: ${row.impressions ?? 0}`,
      row.clicks ? `clicks: ${row.clicks}` : "",
      row.totalEngagements ? `engagements: ${row.totalEngagements}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    touches.push({
      companyName: org.name,
      domain: org.domain,
      date,
      detail: `LinkedIn Ads company visibility — ${metrics}`,
      campaign: "LinkedIn Ads (API, account-level)",
    });
  }
  console.log(
    `LinkedIn API: ${touches.length} company-day visibility rows (≥${minImpressions} impressions, last ${lookbackDays}d)`
  );
  return touches;
}
