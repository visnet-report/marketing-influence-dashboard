// ── HubSpot REST client ────────────────────────────────────────────────────────
// Pulls companies, deals (+company associations), pipeline stage labels, and
// marketing-engaged contacts using a Private App access token.

import type { CrmCompany, CrmDeal } from "./types";

const API_BASE = process.env.HUBSPOT_API_BASE || "https://api.hubapi.com";

function token(): string {
  const t = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!t) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  return t;
}

async function hsFetch(path: string, init?: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`HubSpot ${res.status} after 5 retries: ${path}`);
    const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 15000);
    await new Promise((r) => setTimeout(r, waitMs));
    return hsFetch(path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${res.status} on ${path}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ── Pipelines (stage ID → label, won/closed flags) ────────────────────────────

export interface StageInfo {
  label: string;
  isWon: boolean;
  isClosed: boolean;
}

export async function fetchDealStages(): Promise<Map<string, StageInfo>> {
  const data = await hsFetch("/crm/v3/pipelines/deals");
  const map = new Map<string, StageInfo>();
  for (const pipeline of data.results ?? []) {
    for (const stage of pipeline.stages ?? []) {
      const probability = stage.metadata?.probability;
      map.set(stage.id, {
        label: stage.label,
        isWon: probability === "1.0",
        isClosed: stage.metadata?.isClosed === "true" || stage.metadata?.isClosed === true,
      });
    }
  }
  return map;
}

// ── Companies ─────────────────────────────────────────────────────────────────

export async function fetchAllCompanies(): Promise<CrmCompany[]> {
  const props = ["name", "domain", "country", "zip", "website"];
  const companies: CrmCompany[] = [];
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "100", properties: props.join(",") });
    if (after) qs.set("after", after);
    const data = await hsFetch(`/crm/v3/objects/companies?${qs}`);
    for (const r of data.results ?? []) {
      companies.push({
        id: String(r.id),
        name: r.properties?.name ?? "",
        domain: r.properties?.domain ?? "",
        country: r.properties?.country ?? "",
        zip: r.properties?.zip ?? "",
        website: r.properties?.website ?? "",
      });
    }
    after = data.paging?.next?.after;
  } while (after);
  return companies;
}

// ── Deals (with company associations inline) ──────────────────────────────────

export async function fetchAllDeals(stages: Map<string, StageInfo>): Promise<CrmDeal[]> {
  const props = [
    "dealname",
    "amount_in_home_currency",
    "deal_currency_code",
    "createdate",
    "closedate",
    "dealstage",
    "pipeline",
  ];
  const deals: CrmDeal[] = [];
  let after: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      properties: props.join(","),
      associations: "companies",
    });
    if (after) qs.set("after", after);
    const data = await hsFetch(`/crm/v3/objects/deals?${qs}`);
    for (const r of data.results ?? []) {
      const stage = stages.get(r.properties?.dealstage ?? "");
      const companyId = r.associations?.companies?.results?.[0]?.id;
      deals.push({
        id: String(r.id),
        name: r.properties?.dealname ?? "",
        companyId: companyId ? String(companyId) : "",
        amount: Number(r.properties?.amount_in_home_currency ?? 0) || 0,
        currency: "GBP",
        createDate: r.properties?.createdate ?? "",
        closeDate: r.properties?.closedate ?? "",
        stageId: r.properties?.dealstage ?? "",
        stageLabel: stage?.label ?? r.properties?.dealstage ?? "",
        isWon: stage?.isWon ?? false,
        isClosed: stage?.isClosed ?? false,
      });
    }
    after = data.paging?.next?.after;
  } while (after);
  return deals;
}

// ── Marketing-engaged contacts ────────────────────────────────────────────────

export interface MarketingContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  country: string;
  associatedCompanyId: string;
  createDate: string;
  firstConversionEvent: string;
  firstConversionDate: string;
  recentConversionEvent: string;
  recentConversionDate: string;
  numConversionEvents: number;
  analyticsSource: string;
  analyticsSourceData1: string;
  analyticsSourceData2: string;
  latestSource: string;
  latestSourceData1: string;
  latestSourceData2: string;
  latestSourceTimestamp: string;
}

const CONTACT_PROPS = [
  "email",
  "firstname",
  "lastname",
  "company",
  "country",
  "associatedcompanyid",
  "createdate",
  "first_conversion_event_name",
  "first_conversion_date",
  "recent_conversion_event_name",
  "recent_conversion_date",
  "num_conversion_events",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source",
  "hs_latest_source_data_1",
  "hs_latest_source_data_2",
  "hs_latest_source_timestamp",
];

const MARKETING_SOURCES = [
  "PAID_SEARCH",
  "PAID_SOCIAL",
  "SOCIAL_MEDIA",
  "ORGANIC_SEARCH",
  "EMAIL_MARKETING",
  "OTHER_CAMPAIGNS",
];

/**
 * Contacts that engaged with marketing: submitted ≥1 form, OR whose
 * original/latest traffic source is a marketing channel. Uses the CRM Search
 * API with OR filter groups; paginates via the search `after` cursor.
 * Note: the Search API caps results at 10,000 — well above current volume
 * (~2.5k). If the portal ever exceeds that, split queries by createdate range.
 */
export async function fetchMarketingContacts(): Promise<MarketingContact[]> {
  const filterGroups = [
    { filters: [{ propertyName: "num_conversion_events", operator: "GTE", value: "1" }] },
    { filters: [{ propertyName: "hs_analytics_source", operator: "IN", values: MARKETING_SOURCES }] },
    { filters: [{ propertyName: "hs_latest_source", operator: "IN", values: MARKETING_SOURCES }] },
  ];
  const contacts: MarketingContact[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups,
      properties: CONTACT_PROPS,
      limit: 200,
      sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
    };
    if (after) body.after = after;
    const data = await hsFetch("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const r of data.results ?? []) {
      const p = r.properties ?? {};
      contacts.push({
        id: String(r.id),
        email: p.email ?? "",
        firstName: p.firstname ?? "",
        lastName: p.lastname ?? "",
        company: p.company ?? "",
        country: p.country ?? "",
        associatedCompanyId: p.associatedcompanyid ?? "",
        createDate: p.createdate ?? "",
        firstConversionEvent: p.first_conversion_event_name ?? "",
        firstConversionDate: p.first_conversion_date ?? "",
        recentConversionEvent: p.recent_conversion_event_name ?? "",
        recentConversionDate: p.recent_conversion_date ?? "",
        numConversionEvents: Number(p.num_conversion_events ?? 0) || 0,
        analyticsSource: p.hs_analytics_source ?? "",
        analyticsSourceData1: p.hs_analytics_source_data_1 ?? "",
        analyticsSourceData2: p.hs_analytics_source_data_2 ?? "",
        latestSource: p.hs_latest_source ?? "",
        latestSourceData1: p.hs_latest_source_data_1 ?? "",
        latestSourceData2: p.hs_latest_source_data_2 ?? "",
        latestSourceTimestamp: p.hs_latest_source_timestamp ?? "",
      });
    }
    after = data.paging?.next?.after;
  } while (after);
  return contacts;
}
