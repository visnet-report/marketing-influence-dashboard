// ── Company matching engine ───────────────────────────────────────────────────
// Tiered matching: HubSpot association → email domain → exact cleaned name →
// fuzzy cleaned name, with country/domain corroboration for confidence scoring.

import {
  NAME_STOPWORDS,
  FREE_EMAIL_DOMAINS,
  SECOND_LEVEL_TLDS,
  COUNTRY_ALIASES,
  FUZZY_THRESHOLD,
  FUZZY_STRONG,
} from "./config";
import type { CompanyMatch, Confidence, CrmCompany } from "./types";

// ── Normalization helpers ─────────────────────────────────────────────────────

export function cleanCompanyName(raw: string): string {
  if (!raw) return "";
  const tokens = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_STOPWORDS.has(t));
  return tokens.join(" ");
}

export function normalizeCountry(raw: string): string {
  if (!raw) return "";
  const key = raw.toLowerCase().trim().replace(/[^a-z\s]/g, "");
  return COUNTRY_ALIASES[key] ?? key.toUpperCase();
}

/** Extract the registrable domain from an email, URL, or bare domain. */
export function registrableDomain(input: string): string {
  if (!input) return "";
  let host = input.trim().toLowerCase();
  const at = host.lastIndexOf("@");
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  const lastTwo = parts.slice(-2).join(".");
  if (SECOND_LEVEL_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain);
}

// ── Fuzzy similarity ──────────────────────────────────────────────────────────

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Token-set similarity: handles word reordering and partial containment. */
function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = inter / union;
  // Containment bonus: "ea technology" inside "ea technology australia"
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.97);
}

export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(jaroWinkler(a, b), tokenSetRatio(a, b));
}

// ── Company index ─────────────────────────────────────────────────────────────

interface IndexedCompany {
  company: CrmCompany;
  cleanName: string;
  countryCode: string;
}

export interface CompanyIndex {
  byId: Map<string, CrmCompany>;
  byDomain: Map<string, CrmCompany[]>;
  byCleanName: Map<string, CrmCompany[]>;
  /** Inverted index: name token → companies containing that token. */
  byToken: Map<string, IndexedCompany[]>;
  all: IndexedCompany[];
}

export function buildCompanyIndex(companies: CrmCompany[]): CompanyIndex {
  const byId = new Map<string, CrmCompany>();
  const byDomain = new Map<string, CrmCompany[]>();
  const byCleanName = new Map<string, CrmCompany[]>();
  const byToken = new Map<string, IndexedCompany[]>();
  const all: IndexedCompany[] = [];
  for (const c of companies) {
    byId.set(c.id, c);
    for (const d of [registrableDomain(c.domain), registrableDomain(c.website)]) {
      if (d && !isFreeEmailDomain(d)) {
        const list = byDomain.get(d) ?? [];
        if (!list.includes(c)) {
          list.push(c);
          byDomain.set(d, list);
        }
      }
    }
    const clean = cleanCompanyName(c.name);
    if (clean) {
      const list = byCleanName.get(clean) ?? [];
      list.push(c);
      byCleanName.set(clean, list);
      const entry: IndexedCompany = {
        company: c,
        cleanName: clean,
        countryCode: normalizeCountry(c.country),
      };
      all.push(entry);
      for (const token of new Set(clean.split(" "))) {
        const tlist = byToken.get(token) ?? [];
        tlist.push(entry);
        byToken.set(token, tlist);
      }
    }
  }
  return { byId, byDomain, byCleanName, byToken, all };
}

// ── Matcher ───────────────────────────────────────────────────────────────────

export interface ContactForMatching {
  id: string;
  email: string;
  companyText: string;
  associatedCompanyId: string;
  country: string;
}

/**
 * Match one marketing-engaged contact to a CRM company.
 * Tier 1: HubSpot association (company ID) — High.
 * Tier 2: corporate email domain ↔ company domain/website — High.
 * Tier 3: exact cleaned-name match — High with corroboration, else Medium.
 * Tier 4: fuzzy cleaned-name match — Medium with corroboration, else Low.
 */
export function matchContactToCompany(
  contact: ContactForMatching,
  index: CompanyIndex
): CompanyMatch | null {
  // Tier 1 — explicit association
  if (contact.associatedCompanyId && index.byId.has(contact.associatedCompanyId)) {
    return {
      companyId: contact.associatedCompanyId,
      method: "company_id",
      confidence: "High",
      score: 1,
      evidence: "HubSpot contact→company association",
    };
  }

  const emailDomain = registrableDomain(contact.email);
  const corporateEmail = Boolean(emailDomain) && !isFreeEmailDomain(emailDomain);

  // Tier 2 — email domain
  if (corporateEmail) {
    const hits = index.byDomain.get(emailDomain);
    if (hits?.length) {
      const best = pickByCountry(hits, contact.country);
      return {
        companyId: best.id,
        method: "email_domain",
        confidence: "High",
        score: 1,
        evidence: `email domain ${emailDomain} = company domain`,
      };
    }
  }

  const cleanContact = cleanCompanyName(contact.companyText);
  if (!cleanContact) return null;
  const contactCountry = normalizeCountry(contact.country);

  // Tier 3 — exact cleaned name
  const exact = index.byCleanName.get(cleanContact);
  if (exact?.length) {
    const best = pickByCountry(exact, contact.country);
    const corroborated = corroborate(best, contactCountry, emailDomain, corporateEmail);
    return {
      companyId: best.id,
      method: "exact_name",
      confidence: corroborated ? "High" : "Medium",
      score: 1,
      evidence: corroborated
        ? `exact cleaned name "${cleanContact}" + ${corroborated}`
        : `exact cleaned name "${cleanContact}"`,
    };
  }

  // Tier 4 — fuzzy cleaned name. Candidate set = companies sharing ≥1 name
  // token (a ≥0.88 similarity without any shared token is effectively
  // impossible for multi-word names, and single-token typos are rare enough
  // to trade for a ~100× speedup over scanning all companies).
  const candidates = new Set<CompanyIndex["all"][number]>();
  for (const token of cleanContact.split(" ")) {
    for (const entry of index.byToken.get(token) ?? []) candidates.add(entry);
  }
  let bestScore = 0;
  let bestEntry: CompanyIndex["all"][number] | null = null;
  for (const entry of candidates) {
    const score = nameSimilarity(cleanContact, entry.cleanName);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    } else if (score === bestScore && bestEntry && contactCountry) {
      // tie-break on country agreement
      if (entry.countryCode === contactCountry && bestEntry.countryCode !== contactCountry) {
        bestEntry = entry;
      }
    }
  }
  if (bestEntry && bestScore >= FUZZY_THRESHOLD) {
    const corroborated = corroborate(bestEntry.company, contactCountry, emailDomain, corporateEmail);
    // Country actively disagrees and nothing else corroborates → reject borderline scores
    const countryConflict =
      contactCountry &&
      bestEntry.countryCode &&
      bestEntry.countryCode !== contactCountry &&
      !corroborated;
    if (countryConflict && bestScore < FUZZY_STRONG) return null;
    const confidence: Confidence =
      corroborated && bestScore >= FUZZY_STRONG ? "High" : corroborated ? "Medium" : bestScore >= FUZZY_STRONG ? "Medium" : "Low";
    return {
      companyId: bestEntry.company.id,
      method: "fuzzy_name",
      confidence,
      score: Number(bestScore.toFixed(3)),
      evidence: corroborated
        ? `fuzzy "${cleanContact}" ≈ "${bestEntry.cleanName}" (${bestScore.toFixed(2)}) + ${corroborated}`
        : `fuzzy "${cleanContact}" ≈ "${bestEntry.cleanName}" (${bestScore.toFixed(2)})`,
    };
  }
  return null;
}

function pickByCountry(candidates: CrmCompany[], contactCountry: string): CrmCompany {
  if (candidates.length === 1) return candidates[0];
  const cc = normalizeCountry(contactCountry);
  if (cc) {
    const hit = candidates.find((c) => normalizeCountry(c.country) === cc);
    if (hit) return hit;
  }
  return candidates[0];
}

function corroborate(
  company: CrmCompany,
  contactCountry: string,
  emailDomain: string,
  corporateEmail: boolean
): string | null {
  if (
    corporateEmail &&
    emailDomain &&
    (registrableDomain(company.domain) === emailDomain ||
      registrableDomain(company.website) === emailDomain)
  ) {
    return `email domain ${emailDomain}`;
  }
  const cc = normalizeCountry(company.country);
  if (contactCountry && cc && cc === contactCountry) {
    return `country ${cc}`;
  }
  return null;
}
