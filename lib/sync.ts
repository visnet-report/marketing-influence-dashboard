// ── Sync orchestrator ──────────────────────────────────────────────────────────

import { fetchAllCompanies, fetchAllDeals, fetchDealStages, fetchMarketingContacts } from "./hubspot";
import { computeSnapshot } from "./influence";
import { fetchLinkedInCompanyVisibility, linkedInConfigured } from "./linkedin-api";
import { loadCompanyEngagementCsvs } from "./linkedin-csv";
import { saveSnapshot } from "./store";
import type { Snapshot } from "./types";

export interface SyncResult {
  ok: boolean;
  generatedAt: string;
  durationMs: number;
  counts: {
    companies: number;
    deals: number;
    marketingContacts: number;
    matchedContacts: number;
    influencedDeals: number;
  };
}

export async function runSync(): Promise<SyncResult> {
  const started = Date.now();
  const stages = await fetchDealStages();
  const [companies, deals, contacts, csvTouches, apiTouches] = await Promise.all([
    fetchAllCompanies(),
    fetchAllDeals(stages),
    fetchMarketingContacts(),
    loadCompanyEngagementCsvs(),
    // Paid LinkedIn visibility straight from the Ads API when configured;
    // a failure here must not take down the HubSpot sync.
    linkedInConfigured()
      ? fetchLinkedInCompanyVisibility().catch((err) => {
          console.error("LinkedIn API fetch failed (continuing without it):", err);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const snapshot: Snapshot = computeSnapshot(companies, deals, contacts, started, [
    ...csvTouches,
    ...apiTouches,
  ]);
  await saveSnapshot(snapshot);
  return {
    ok: true,
    generatedAt: snapshot.generatedAt,
    durationMs: snapshot.syncDurationMs,
    counts: {
      companies: companies.length,
      deals: deals.length,
      marketingContacts: contacts.length,
      matchedContacts: snapshot.totals.matchedContacts,
      influencedDeals: snapshot.totals.influencedDeals,
    },
  };
}
