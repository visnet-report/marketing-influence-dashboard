// ── Influence engine ───────────────────────────────────────────────────────────
// Converts contacts into touchpoints, matches them to companies, then joins
// against deals with the halt rule: a touch influences a deal if it falls
// before the deal's close date (closed deals) or before now (open deals),
// and no earlier than LOOKBACK_DAYS before deal creation.

import { LOOKBACK_DAYS, MAX_UNMATCHED_ROWS } from "./config";
import type { MarketingContact } from "./hubspot";
import type { CompanyLevelTouch } from "./linkedin-csv";
import {
  buildCompanyIndex,
  matchContactToCompany,
  registrableDomain,
  isFreeEmailDomain,
} from "./matching";
import type {
  Channel,
  ChannelStats,
  CompanyInfluence,
  CompanyMatch,
  Confidence,
  CrmCompany,
  CrmDeal,
  DailyStats,
  DealTouch,
  InfluencedDeal,
  InfluenceTouch,
  MatchMethod,
  MonthlyStats,
  Snapshot,
  Touchpoint,
  UnmatchedActivity,
} from "./types";

/** Accessors for the index-based touch references on InfluencedDeal. */
export function dealFirstTouch(d: InfluencedDeal): DealTouch | null {
  return d.touches[d.firstTouchIdx] ?? null;
}
export function dealLastTouchBeforeCreation(d: InfluencedDeal): DealTouch | null {
  return d.lastTouchBeforeCreationIdx >= 0 ? (d.touches[d.lastTouchBeforeCreationIdx] ?? null) : null;
}
export function dealLastTouch(d: InfluencedDeal): DealTouch | null {
  return d.touches[d.lastTouchIdx] ?? null;
}

// ── Touchpoint extraction ─────────────────────────────────────────────────────

function sourceToChannel(source: string): Channel | null {
  switch (source) {
    case "PAID_SEARCH":
      return "paid_search";
    case "PAID_SOCIAL":
      return "paid_social";
    case "SOCIAL_MEDIA":
      return "organic_social";
    case "ORGANIC_SEARCH":
      return "organic_search";
    case "EMAIL_MARKETING":
      return "email_marketing";
    case "REFERRALS":
      return "referral";
    case "AI_REFERRALS":
      return "ai_referral";
    case "OTHER_CAMPAIGNS":
      return "other";
    case "DIRECT_TRAFFIC":
      return "direct";
    default:
      // OFFLINE stays excluded: imported/sales-created records, not visits.
      return null;
  }
}

function sourceDetail(network: string, campaign: string): { detail: string; campaign: string } {
  const parts = [network, campaign].filter(Boolean);
  return { detail: parts.join(" — "), campaign: campaign || network || "" };
}

export function extractTouchpoints(contact: MarketingContact): Touchpoint[] {
  const touches: Touchpoint[] = [];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;
  const base = {
    contactId: contact.id,
    contactName: name,
    contactEmail: contact.email,
    contactCompanyText: contact.company,
  };

  // 1. Form submissions (first + most recent conversion)
  if (contact.firstConversionDate && contact.firstConversionEvent) {
    touches.push({
      ...base,
      channel: "form_submission",
      date: contact.firstConversionDate,
      detail: contact.firstConversionEvent,
      campaign: contact.firstConversionEvent.split(":").pop()?.trim() ?? "",
      source: "first_conversion",
    });
  }
  if (
    contact.recentConversionDate &&
    contact.recentConversionEvent &&
    contact.recentConversionDate !== contact.firstConversionDate
  ) {
    touches.push({
      ...base,
      channel: "form_submission",
      date: contact.recentConversionDate,
      detail: contact.recentConversionEvent,
      campaign: contact.recentConversionEvent.split(":").pop()?.trim() ?? "",
      source: "recent_conversion",
    });
  }

  // 2. Original traffic source (dated at contact creation)
  const originalChannel = sourceToChannel(contact.analyticsSource);
  if (originalChannel && contact.createDate) {
    const { detail, campaign } = sourceDetail(
      contact.analyticsSourceData1,
      contact.analyticsSourceData2
    );
    touches.push({
      ...base,
      channel: originalChannel,
      date: contact.createDate,
      detail: detail || contact.analyticsSource,
      campaign,
      source: "original_source",
    });
  }

  // 3. Latest traffic source (only if it is a distinct later marketing session)
  const latestChannel = sourceToChannel(contact.latestSource);
  if (
    latestChannel &&
    contact.latestSourceTimestamp &&
    contact.latestSourceTimestamp !== contact.createDate
  ) {
    const { detail, campaign } = sourceDetail(
      contact.latestSourceData1,
      contact.latestSourceData2
    );
    touches.push({
      ...base,
      channel: latestChannel,
      date: contact.latestSourceTimestamp,
      detail: detail || contact.latestSource,
      campaign,
      source: "latest_source",
    });
  }

  return touches;
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeSnapshot(
  companies: CrmCompany[],
  deals: CrmDeal[],
  contacts: MarketingContact[],
  startedAt: number,
  companyLevelTouches: CompanyLevelTouch[] = []
): Snapshot {
  const index = buildCompanyIndex(companies);
  const companyById = index.byId;

  // Deals grouped by company
  const dealsByCompany = new Map<string, CrmDeal[]>();
  for (const d of deals) {
    if (!d.companyId) continue;
    const list = dealsByCompany.get(d.companyId) ?? [];
    list.push(d);
    dealsByCompany.set(d.companyId, list);
  }

  // Match contacts → companies, collect touches per company
  const touchesByCompany = new Map<string, InfluenceTouch[]>();
  const matchByContact = new Map<string, CompanyMatch>();
  const unmatched: UnmatchedActivity[] = [];
  const matchMethodCounts: Record<MatchMethod, number> = {
    company_id: 0,
    email_domain: 0,
    exact_name: 0,
    fuzzy_name: 0,
  };
  const confidenceCounts: Record<Confidence, number> = { High: 0, Medium: 0, Low: 0 };
  let totalTouchpoints = 0;
  let matchedContacts = 0;

  for (const contact of contacts) {
    const touches = extractTouchpoints(contact);
    if (!touches.length) continue;
    totalTouchpoints += touches.length;

    const match = matchContactToCompany(
      {
        id: contact.id,
        email: contact.email,
        companyText: contact.company,
        associatedCompanyId: contact.associatedCompanyId,
        country: contact.country,
      },
      index
    );

    if (match) {
      matchedContacts++;
      matchByContact.set(contact.id, match);
      matchMethodCounts[match.method]++;
      confidenceCounts[match.confidence]++;
      const list = touchesByCompany.get(match.companyId) ?? [];
      for (const t of touches) {
        list.push({
          ...t,
          matchMethod: match.method,
          confidence: match.confidence,
          matchScore: match.score,
          matchEvidence: match.evidence,
          timing: "before_creation", // recomputed per deal below
        });
      }
      touchesByCompany.set(match.companyId, list);
    } else if (unmatched.length < MAX_UNMATCHED_ROWS) {
      const dates = touches.map((t) => t.date).sort();
      const emailDomain = registrableDomain(contact.email);
      const reason = !contact.company && (!emailDomain || isFreeEmailDomain(emailDomain))
        ? "No company name and personal email"
        : "No CRM company matched above threshold";
      unmatched.push({
        contactId: contact.id,
        contactName:
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email,
        contactEmail: contact.email,
        contactCompanyText: contact.company,
        channels: [...new Set(touches.map((t) => t.channel))],
        firstActivity: dates[0],
        lastActivity: dates[dates.length - 1],
        touchCount: touches.length,
        reason,
      });
    }
  }

  // Company-level visibility touches (LinkedIn Company Engagement Report CSVs)
  // run through the same matcher via a synthetic contact: the report's company
  // name (and domain when exported) drive domain/exact/fuzzy matching.
  let csvIdx = 0;
  for (const row of companyLevelTouches) {
    csvIdx++;
    totalTouchpoints++;
    // Rows that carry a HubSpot company ID (e.g. Buyer Intent list members)
    // match directly; everything else goes through domain/name matching.
    const match: CompanyMatch | null =
      row.companyId && companyById.has(row.companyId)
        ? {
            companyId: row.companyId,
            method: "company_id",
            confidence: "High",
            score: 1,
            evidence: "HubSpot list membership (company ID)",
          }
        : matchContactToCompany(
            {
              id: `li-csv-${csvIdx}`,
              email: row.domain ? `report@${row.domain}` : "",
              companyText: row.companyName,
              associatedCompanyId: "",
              country: "",
            },
            index
          );
    if (match) {
      matchMethodCounts[match.method]++;
      confidenceCounts[match.confidence]++;
      const matchedCompany = companyById.get(match.companyId);
      const matchedName = row.companyName || matchedCompany?.name || "";
      // HubSpot list rows (Buyer Intent) carry the join date, which is wrong
      // for pre-existing members — prefer the company's real last tracked
      // visit timestamp when HubSpot has one.
      let touchDate = row.date;
      let touchDetail = row.detail;
      if (row.companyId && matchedCompany?.lastIntentVisit) {
        touchDate = matchedCompany.lastIntentVisit;
        touchDetail += " — dated by last tracked visit";
      }
      if (row.companyId && matchedCompany?.intentPageViews30d) {
        touchDetail += `, ${matchedCompany.intentPageViews30d} tracked page views (30d)`;
      }
      const list = touchesByCompany.get(match.companyId) ?? [];
      list.push({
        contactId: `li-csv-${csvIdx}`,
        contactName: matchedName,
        contactEmail: "",
        contactCompanyText: matchedName,
        channel: row.channel ?? "linkedin_visibility",
        date: touchDate,
        detail: touchDetail,
        campaign: row.campaign,
        source: "linkedin_company_csv",
        matchMethod: match.method,
        confidence: match.confidence,
        matchScore: match.score,
        matchEvidence: match.evidence,
        timing: "before_creation",
      });
      touchesByCompany.set(match.companyId, list);
    } else if (unmatched.length < MAX_UNMATCHED_ROWS) {
      unmatched.push({
        contactId: `li-csv-${csvIdx}`,
        contactName: row.companyName,
        contactEmail: "",
        contactCompanyText: row.companyName,
        channels: [row.channel ?? "linkedin_visibility"],
        firstActivity: row.date,
        lastActivity: row.date,
        touchCount: 1,
        reason: "Imported report company not found in CRM",
      });
    }
  }

  // Join touches against deals with halt + lookback rules
  const now = Date.now();
  const lookbackMs = LOOKBACK_DAYS * 24 * 3600 * 1000;
  const influencedDeals: InfluencedDeal[] = [];

  for (const [companyId, companyTouches] of touchesByCompany) {
    const companyDeals = dealsByCompany.get(companyId);
    if (!companyDeals) continue;
    const company = companyById.get(companyId);
    for (const deal of companyDeals) {
      const created = Date.parse(deal.createDate);
      if (Number.isNaN(created)) continue;
      const halt = deal.isClosed && deal.closeDate ? Date.parse(deal.closeDate) : now;
      const windowStart = created - lookbackMs;

      const eligible: DealTouch[] = [];
      for (const t of companyTouches) {
        const ts = Date.parse(t.date);
        if (Number.isNaN(ts)) continue;
        if (ts < windowStart || ts > halt) continue;
        eligible.push({
          contactId: t.contactId,
          contactName: t.contactName,
          channel: t.channel,
          date: t.date,
          detail: t.detail,
          campaign: t.campaign,
          matchMethod: t.matchMethod,
          confidence: t.confidence,
          timing: ts < created ? "before_creation" : "during_open",
        });
      }
      if (!eligible.length) continue;
      eligible.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

      let lastBeforeIdx = -1;
      for (let i = eligible.length - 1; i >= 0; i--) {
        if (eligible[i].timing === "before_creation") {
          lastBeforeIdx = i;
          break;
        }
      }
      influencedDeals.push({
        dealId: deal.id,
        dealName: deal.name,
        companyId,
        companyName: company?.name ?? "",
        companyDomain: company?.domain ?? "",
        companyCountry: company?.country ?? "",
        amount: deal.amount,
        currency: deal.currency,
        createDate: deal.createDate,
        closeDate: deal.closeDate,
        stageLabel: deal.stageLabel,
        isWon: deal.isWon,
        isClosed: deal.isClosed,
        touches: eligible,
        firstTouchIdx: 0,
        lastTouchBeforeCreationIdx: lastBeforeIdx,
        lastTouchIdx: eligible.length - 1,
        channels: [...new Set(eligible.map((t) => t.channel))],
      });
    }
  }

  // ── Aggregations ────────────────────────────────────────────────────────────

  const channelMap = new Map<Channel, ChannelStats>();
  const ensureChannel = (c: Channel): ChannelStats => {
    let s = channelMap.get(c);
    if (!s) {
      s = {
        channel: c,
        touches: 0,
        contacts: 0,
        companies: 0,
        influencedDeals: 0,
        influencedValue: 0,
        wonDeals: 0,
        wonValue: 0,
        firstTouchDeals: 0,
        firstTouchValue: 0,
        lastTouchDeals: 0,
        lastTouchValue: 0,
      };
      channelMap.set(c, s);
    }
    return s;
  };

  const channelContacts = new Map<Channel, Set<string>>();
  const channelCompanies = new Map<Channel, Set<string>>();
  for (const [companyId, touches] of touchesByCompany) {
    for (const t of touches) {
      const s = ensureChannel(t.channel);
      s.touches++;
      (channelContacts.get(t.channel) ?? channelContacts.set(t.channel, new Set()).get(t.channel)!).add(
        t.contactId
      );
      (channelCompanies.get(t.channel) ?? channelCompanies.set(t.channel, new Set()).get(t.channel)!).add(
        companyId
      );
    }
  }
  for (const [channel, set] of channelContacts) ensureChannel(channel).contacts = set.size;
  for (const [channel, set] of channelCompanies) ensureChannel(channel).companies = set.size;

  for (const d of influencedDeals) {
    for (const c of d.channels) {
      const s = ensureChannel(c);
      s.influencedDeals++;
      s.influencedValue += d.amount;
      if (d.isWon) {
        s.wonDeals++;
        s.wonValue += d.amount;
      }
    }
    const first = dealFirstTouch(d);
    if (first) {
      const s = ensureChannel(first.channel);
      s.firstTouchDeals++;
      s.firstTouchValue += d.amount;
    }
    const lastAttrib = dealLastTouchBeforeCreation(d) ?? dealLastTouch(d);
    if (lastAttrib) {
      const s = ensureChannel(lastAttrib.channel);
      s.lastTouchDeals++;
      s.lastTouchValue += d.amount;
    }
  }

  // Monthly + daily deal-creation totals (full history — the dashboard's date
  // selector needs exact denominators for any custom range).
  const monthly = new Map<string, MonthlyStats>();
  const daily = new Map<string, DailyStats>();
  const influencedIds = new Set(influencedDeals.map((d) => d.dealId));
  const influencedById = new Map(influencedDeals.map((d) => [d.dealId, d]));
  for (const d of deals) {
    if (!d.createDate) continue;
    const mKey = d.createDate.slice(0, 7);
    let m = monthly.get(mKey);
    if (!m) {
      m = { month: mKey, dealsCreated: 0, dealsValue: 0, influencedDeals: 0, influencedValue: 0, touches: 0 };
      monthly.set(mKey, m);
    }
    m.dealsCreated++;
    m.dealsValue += d.amount;
    const dKey = d.createDate.slice(0, 10);
    let day = daily.get(dKey);
    if (!day) {
      day = {
        date: dKey,
        dealsCreated: 0,
        dealsValue: 0,
        wonDeals: 0,
        wonValue: 0,
        openDeals: 0,
        openValue: 0,
        influencedDeals: 0,
        influencedValue: 0,
      };
      daily.set(dKey, day);
    }
    day.dealsCreated++;
    day.dealsValue += d.amount;
    if (d.isWon) {
      day.wonDeals++;
      day.wonValue += d.amount;
    } else if (!d.isClosed) {
      day.openDeals++;
      day.openValue += d.amount;
    }
    if (influencedIds.has(d.id)) {
      m.influencedDeals++;
      m.influencedValue += d.amount;
      m.touches += influencedById.get(d.id)?.touches.length ?? 0;
      day.influencedDeals++;
      day.influencedValue += d.amount;
    }
  }
  const monthlySorted = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  const dailySorted = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Per-company rollup
  const companyInfluence: CompanyInfluence[] = [];
  for (const [companyId, touches] of touchesByCompany) {
    const company = companyById.get(companyId);
    const companyDeals = dealsByCompany.get(companyId) ?? [];
    const infDeals = influencedDeals.filter((d) => d.companyId === companyId);
    const dates = touches.map((t) => t.date).sort();
    const rank: Record<Confidence, number> = { High: 3, Medium: 2, Low: 1 };
    const best = touches.reduce<Confidence>(
      (acc, t) => (rank[t.confidence] > rank[acc] ? t.confidence : acc),
      "Low"
    );
    companyInfluence.push({
      companyId,
      companyName: company?.name ?? "",
      companyDomain: company?.domain ?? "",
      companyCountry: company?.country ?? "",
      matchMethods: [...new Set(touches.map((t) => t.matchMethod))],
      bestConfidence: best,
      touchCount: touches.length,
      contactCount: new Set(touches.map((t) => t.contactId)).size,
      channels: [...new Set(touches.map((t) => t.channel))],
      firstTouchDate: dates[0] ?? "",
      lastTouchDate: dates[dates.length - 1] ?? "",
      dealCount: companyDeals.length,
      influencedDealCount: infDeals.length,
      totalDealValue: companyDeals.reduce((s, d) => s + d.amount, 0),
      wonDealValue: companyDeals.filter((d) => d.isWon).reduce((s, d) => s + d.amount, 0),
      touches: touches
        .slice()
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .slice(0, 100),
    });
  }
  companyInfluence.sort((a, b) => b.totalDealValue - a.totalDealValue);

  // Totals
  const totalValue = deals.reduce((s, d) => s + d.amount, 0);
  const won = deals.filter((d) => d.isWon);
  const open = deals.filter((d) => !d.isClosed);
  const infWon = influencedDeals.filter((d) => d.isWon);
  const infOpen = influencedDeals.filter((d) => !d.isClosed);

  influencedDeals.sort((a, b) => Date.parse(b.createDate) - Date.parse(a.createDate));

  return {
    generatedAt: new Date().toISOString(),
    syncDurationMs: Date.now() - startedAt,
    currency: "GBP",
    config: { lookbackDays: LOOKBACK_DAYS, fuzzyThreshold: 0.88 },
    totals: {
      deals: deals.length,
      dealsValue: totalValue,
      wonDeals: won.length,
      wonValue: won.reduce((s, d) => s + d.amount, 0),
      openDeals: open.length,
      openValue: open.reduce((s, d) => s + d.amount, 0),
      companies: companies.length,
      companiesWithDeals: dealsByCompany.size,
      marketingContacts: contacts.length,
      matchedContacts,
      touchpoints: totalTouchpoints,
      influencedDeals: influencedDeals.length,
      influencedValue: influencedDeals.reduce((s, d) => s + d.amount, 0),
      influencedWonDeals: infWon.length,
      influencedWonValue: infWon.reduce((s, d) => s + d.amount, 0),
      influencedOpenDeals: infOpen.length,
      influencedOpenValue: infOpen.reduce((s, d) => s + d.amount, 0),
      influencedCompanies: new Set(influencedDeals.map((d) => d.companyId)).size,
    },
    channels: [...channelMap.values()].sort((a, b) => b.influencedValue - a.influencedValue),
    monthly: monthlySorted,
    daily: dailySorted,
    deals: influencedDeals,
    companies: companyInfluence,
    unmatched,
    matchMethodCounts,
    confidenceCounts,
  };
}
