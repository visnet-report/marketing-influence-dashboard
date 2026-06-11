// ── Shared types for the marketing influence engine ──────────────────────────

export type Channel =
  | "form_submission"
  | "paid_search"
  | "paid_social"
  | "organic_social"
  | "organic_search"
  | "email_marketing"
  | "referral"
  | "direct"
  | "linkedin_visibility"
  | "other";

export type MatchMethod = "company_id" | "email_domain" | "exact_name" | "fuzzy_name";
export type Confidence = "High" | "Medium" | "Low";

/** A single marketing interaction attributed to a contact (or company, for CSV imports). */
export interface Touchpoint {
  contactId: string;
  contactName: string;
  contactEmail: string;
  /** Free-text company name the contact typed on a form (used for matching). */
  contactCompanyText: string;
  channel: Channel;
  /** ISO date of the interaction. */
  date: string;
  /** Human-readable description: form name, campaign, search keyword, post name. */
  detail: string;
  campaign: string;
  source:
    | "first_conversion"
    | "recent_conversion"
    | "original_source"
    | "latest_source"
    | "linkedin_company_csv";
}

/** How a marketing-engaged contact was matched to a CRM company. */
export interface CompanyMatch {
  companyId: string;
  method: MatchMethod;
  confidence: Confidence;
  score: number;
  /** Evidence used to corroborate the match (country, domain, email domain). */
  evidence: string;
}

export interface CrmCompany {
  id: string;
  name: string;
  domain: string;
  country: string;
  zip: string;
  website: string;
}

export interface CrmDeal {
  id: string;
  name: string;
  companyId: string;
  amount: number; // home currency (GBP)
  currency: string;
  createDate: string;
  closeDate: string;
  stageId: string;
  stageLabel: string;
  isWon: boolean;
  isClosed: boolean;
}

/** A touchpoint that has been matched to a company and evaluated against a deal. */
export interface InfluenceTouch extends Touchpoint {
  matchMethod: MatchMethod;
  confidence: Confidence;
  matchScore: number;
  matchEvidence: string;
  /** Position of the touch relative to the deal lifecycle. */
  timing: "before_creation" | "during_open";
}

export interface InfluencedDeal {
  dealId: string;
  dealName: string;
  companyId: string;
  companyName: string;
  companyDomain: string;
  companyCountry: string;
  amount: number;
  currency: string;
  createDate: string;
  closeDate: string;
  stageLabel: string;
  isWon: boolean;
  isClosed: boolean;
  touches: InfluenceTouch[];
  firstTouch: InfluenceTouch | null;
  /** Last touch dated before the deal was created. */
  lastTouchBeforeCreation: InfluenceTouch | null;
  /** Last eligible touch overall (before close / now). */
  lastTouch: InfluenceTouch | null;
  channels: Channel[];
}

export interface CompanyInfluence {
  companyId: string;
  companyName: string;
  companyDomain: string;
  companyCountry: string;
  matchMethods: MatchMethod[];
  bestConfidence: Confidence;
  touchCount: number;
  contactCount: number;
  channels: Channel[];
  firstTouchDate: string;
  lastTouchDate: string;
  dealCount: number;
  influencedDealCount: number;
  totalDealValue: number;
  wonDealValue: number;
  touches: InfluenceTouch[];
}

/** Marketing-engaged contact that could not be matched to any CRM company. */
export interface UnmatchedActivity {
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactCompanyText: string;
  channels: Channel[];
  firstActivity: string;
  lastActivity: string;
  touchCount: number;
  reason: string;
}

export interface ChannelStats {
  channel: Channel;
  touches: number;
  contacts: number;
  companies: number;
  influencedDeals: number;
  influencedValue: number;
  wonDeals: number;
  wonValue: number;
  /** First-touch attributed deals/value. */
  firstTouchDeals: number;
  firstTouchValue: number;
  /** Last-touch (before creation, falling back to last eligible) attributed deals/value. */
  lastTouchDeals: number;
  lastTouchValue: number;
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  dealsCreated: number;
  dealsValue: number;
  influencedDeals: number;
  influencedValue: number;
  touches: number;
}

/** Per-day deal-creation totals — exact denominators for custom date ranges. */
export interface DailyStats {
  date: string; // YYYY-MM-DD
  dealsCreated: number;
  dealsValue: number;
  wonDeals: number;
  wonValue: number;
  openDeals: number;
  openValue: number;
  influencedDeals: number;
  influencedValue: number;
}

export interface Snapshot {
  generatedAt: string;
  syncDurationMs: number;
  currency: string;
  config: {
    lookbackDays: number;
    fuzzyThreshold: number;
  };
  totals: {
    deals: number;
    dealsValue: number;
    wonDeals: number;
    wonValue: number;
    openDeals: number;
    openValue: number;
    companies: number;
    companiesWithDeals: number;
    marketingContacts: number;
    matchedContacts: number;
    touchpoints: number;
    influencedDeals: number;
    influencedValue: number;
    influencedWonDeals: number;
    influencedWonValue: number;
    influencedOpenDeals: number;
    influencedOpenValue: number;
    influencedCompanies: number;
  };
  channels: ChannelStats[];
  monthly: MonthlyStats[];
  /** Optional for snapshots generated before daily stats existed. */
  daily?: DailyStats[];
  deals: InfluencedDeal[];
  companies: CompanyInfluence[];
  unmatched: UnmatchedActivity[];
  matchMethodCounts: Record<MatchMethod, number>;
  confidenceCounts: Record<Confidence, number>;
}
