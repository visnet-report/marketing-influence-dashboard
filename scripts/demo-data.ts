// Generates a realistic demo snapshot so the dashboard can be previewed before
// HubSpot credentials are configured. Also exercises the full matching +
// influence engine end-to-end. Run: npm run demo
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import type { CrmCompany, CrmDeal } from "../lib/types";
import type { MarketingContact } from "../lib/hubspot";

// Deterministic PRNG so demo output is stable
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function dateBetween(start: string, end: string): string {
  const s = Date.parse(start);
  const e = Date.parse(end);
  return new Date(s + rand() * (e - s)).toISOString();
}

const COMPANY_SEEDS: Array<[string, string, string]> = [
  ["National Grid Electricity Distribution", "nationalgrid.co.uk", "england"],
  ["UK Power Networks Ltd", "ukpowernetworks.co.uk", "england"],
  ["Northern Powergrid Holdings", "northernpowergrid.com", "england"],
  ["SP Energy Networks", "spenergynetworks.co.uk", "scotland"],
  ["Scottish and Southern Electricity Networks", "ssen.co.uk", "scotland"],
  ["Electricity North West Limited", "enwl.co.uk", "england"],
  ["Stantec UK Ltd", "stantec.com", "england"],
  ["Mott MacDonald Group", "mottmac.com", "england"],
  ["Burns & McDonnell Inc", "burnsmcd.com", "usa"],
  ["Dominion Energy", "dominionenergy.com", "usa"],
  ["Duke Energy Corporation", "duke-energy.com", "usa"],
  ["Exelon Corporation", "exeloncorp.com", "usa"],
  ["Pacific Gas and Electric Company", "pge.com", "usa"],
  ["Consolidated Edison Inc", "coned.com", "usa"],
  ["Ausgrid Pty Ltd", "ausgrid.com.au", "australia"],
  ["Endeavour Energy", "endeavourenergy.com.au", "australia"],
  ["Powercor Australia", "powercor.com.au", "australia"],
  ["Transpower NZ Ltd", "transpower.co.nz", "new zealand"],
  ["SP Group Singapore", "spgroup.com.sg", "singapore"],
  ["Tenaga Nasional Berhad", "tnb.com.my", "malaysia"],
  ["Schneider Electric", "se.com", "france"],
  ["Siemens Energy", "siemens-energy.com", "germany"],
  ["Brush Transformers Ltd", "brush.eu", "england"],
  ["Larsen & Toubro Limited", "larsentoubro.com", "india"],
  ["Hydro One Networks", "hydroone.com", "canada"],
  ["BC Hydro", "bchydro.com", "canada"],
  ["Freedom Group Services", "freedom-group.co.uk", "england"],
  ["JM Test Systems", "jmtest.com", "usa"],
  ["Sunbelt Rentals Ltd", "sunbeltrentals.co.uk", "england"],
  ["AWE Plc", "awe.co.uk", "england"],
  ["Transmission Investment LLP", "tinv.com", "england"],
  ["Wales & West Utilities", "wwutilities.co.uk", "wales"],
  ["ESB Networks", "esbnetworks.ie", "ireland"],
  ["Iberdrola SA", "iberdrola.com", "spain"],
  ["Enel Group", "enel.com", "italy"],
  ["Vattenfall AB", "vattenfall.com", "sweden"],
  ["Orsted AS", "orsted.com", "denmark"],
  ["E.ON UK Plc", "eonenergy.com", "england"],
  ["Centrica Plc", "centrica.com", "england"],
  ["EDF Energy Ltd", "edfenergy.com", "england"],
];

const FORMS = [
  "Contact Us | EA Technology: EMEA Contact Us",
  "UltraTEV® Plus² | EA Technology: UltraTEV Plus2 - Request a quote",
  "Course Enquiry | EA Technology Training: EMEA Training Contact Us",
  "Product Contact us Form | EA Technology Americas: USA Product Enquiry",
  "Low Voltage Products & Tools | VisNet®: VisNet.Tech - Newsletter",
  "Whitepaper Download | EA Technology: Condition Monitoring Guide",
  "Webinar Registration | EA Technology: Partial Discharge Masterclass",
];

const PAID_SEARCH_CAMPAIGNS: Array<[string, string]> = [
  ["12086559992", "ea technology"],
  ["product - australia- gsn", "ultratev plus 2"],
  ["product - sea", "hv monitoring"],
  ["20347469422", "Unknown keywords (SSL)"],
  ["Auto-tagged PPC", "partial discharge testing"],
];

const PAID_SOCIAL_CAMPAIGNS: Array<[string, string]> = [
  ["LinkedIn", "am remarketing (all event leads)"],
  ["LinkedIn", "emea - ultratev launch q2"],
  ["LinkedIn", "americas - substation week"],
];

const ORGANIC_SOCIAL_CAMPAIGNS: Array<[string, string]> = [
  ["LinkedIn", "351856864-emea - visnet whitepaper 2026"],
  ["LinkedIn", "company page post - cable fault case study"],
];

const FIRST_NAMES = ["James", "Sarah", "Wei", "Priya", "Carlos", "Emma", "Liam", "Aisha", "Tom", "Nina", "Raj", "Sophie", "Marco", "Grace", "Dan"];
const LAST_NAMES = ["Smith", "Patel", "Chen", "Garcia", "Brown", "Wilson", "Khan", "Taylor", "Anderson", "Lee", "Murphy", "Clark", "Nguyen", "Hall", "Wright"];

function buildCompanies(): CrmCompany[] {
  return COMPANY_SEEDS.map(([name, domain, country], i) => ({
    id: String(1000 + i),
    name,
    // ~35% of demo companies have no domain, mirroring the real portal
    domain: rand() < 0.35 ? "" : domain,
    country,
    zip: "",
    website: rand() < 0.5 ? `https://www.${domain}` : "",
    lastIntentVisit: rand() < 0.3 ? dateBetween("2026-04-01", "2026-06-10") : "",
    intentPageViews30d: rand() < 0.3 ? Math.floor(rand() * 40) : 0,
  }));
}

function buildDeals(companies: CrmCompany[]): CrmDeal[] {
  const deals: CrmDeal[] = [];
  const stages = [
    { id: "contractsent", label: "Stage 1 Enquiry", isWon: false, isClosed: false },
    { id: "2318398704", label: "Stage 3 Client Consideration", isWon: false, isClosed: false },
    { id: "2318398705", label: "Stage 4 PO Received", isWon: false, isClosed: false },
    { id: "2318398707", label: "Won", isWon: true, isClosed: true },
    { id: "2318398708", label: "Lost", isWon: false, isClosed: true },
  ];
  const products = ["UltraTEV Plus2", "VisNet Hub rollout", "Substation training", "Cable diagnostics", "Condition assessment", "PD survey", "ALVIN reclosers"];
  let id = 50000;
  for (const company of companies) {
    const n = 1 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) {
      const stage = pick(stages);
      const createDate = dateBetween("2025-01-15", "2026-06-01");
      const closeDate = stage.isClosed
        ? dateBetween(createDate, "2026-06-09")
        : dateBetween("2026-06-15", "2026-12-31");
      deals.push({
        id: String(id++),
        name: `${company.name.split(" ")[0]} ${pick(products)}`,
        companyId: company.id,
        amount: Math.round((5000 + rand() * 250000) / 100) * 100,
        currency: "GBP",
        createDate,
        closeDate,
        stageId: stage.id,
        stageLabel: stage.label,
        isWon: stage.isWon,
        isClosed: stage.isClosed,
      });
    }
  }
  return deals;
}

function buildContacts(companies: CrmCompany[]): MarketingContact[] {
  const contacts: MarketingContact[] = [];
  let id = 90000;
  for (let i = 0; i < 110; i++) {
    const company = pick(companies);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const r = rand();
    // Vary the match pathway: association / corporate email / messy name / personal email
    const hasAssociation = r < 0.35;
    const corporateEmail = r < 0.75;
    const domain = company.domain || company.website.replace(/^https:\/\/www\./, "") || "example.org";
    const email = corporateEmail
      ? `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`
      : `${first.toLowerCase()}${last.toLowerCase()}${Math.floor(rand() * 99)}@gmail.com`;
    // Messy variants of the company name, as typed into forms
    const nameVariants = [
      company.name,
      company.name.replace(/ (Ltd|Limited|Inc|Plc|Pty Ltd|LLP|SA|AB|AS|Berhad|Corporation|Group|Holdings)$/i, ""),
      company.name.toUpperCase(),
      company.name.replace(/ &/g, " and") + ",",
    ];
    const createDate = dateBetween("2025-06-01", "2026-06-08");
    const sourceRoll = rand();
    const source =
      sourceRoll < 0.35 ? "PAID_SEARCH"
      : sourceRoll < 0.5 ? "ORGANIC_SEARCH"
      : sourceRoll < 0.62 ? "PAID_SOCIAL"
      : sourceRoll < 0.72 ? "SOCIAL_MEDIA"
      : sourceRoll < 0.82 ? "DIRECT_TRAFFIC"
      : "EMAIL_MARKETING";
    const [d1, d2] =
      source === "PAID_SEARCH" ? pick(PAID_SEARCH_CAMPAIGNS)
      : source === "PAID_SOCIAL" ? pick(PAID_SOCIAL_CAMPAIGNS)
      : source === "SOCIAL_MEDIA" ? pick(ORGANIC_SOCIAL_CAMPAIGNS)
      : ["", ""];
    const submitsForm = rand() < 0.8;
    const firstForm = submitsForm ? pick(FORMS) : "";
    const recentDate = submitsForm && rand() < 0.4 ? dateBetween(createDate, "2026-06-09") : "";
    contacts.push({
      id: String(id++),
      email,
      firstName: first,
      lastName: last,
      company: pick(nameVariants),
      country: rand() < 0.7 ? company.country : "",
      associatedCompanyId: hasAssociation ? company.id : "",
      createDate,
      firstConversionEvent: firstForm,
      firstConversionDate: submitsForm ? createDate : "",
      recentConversionEvent: recentDate ? pick(FORMS) : firstForm,
      recentConversionDate: recentDate || (submitsForm ? createDate : ""),
      numConversionEvents: submitsForm ? 1 + Math.floor(rand() * 4) : 0,
      analyticsSource: source,
      analyticsSourceData1: d1,
      analyticsSourceData2: d2,
      latestSource: rand() < 0.3 ? "PAID_SOCIAL" : source,
      latestSourceData1: rand() < 0.3 ? "LinkedIn" : d1,
      latestSourceData2: rand() < 0.3 ? pick(PAID_SOCIAL_CAMPAIGNS)[1] : d2,
      latestSourceTimestamp: rand() < 0.5 ? dateBetween(createDate, "2026-06-09") : createDate,
    });
  }
  // A few contacts that won't match anything (personal email, unknown company)
  for (let i = 0; i < 12; i++) {
    const first = pick(FIRST_NAMES);
    contacts.push({
      id: String(id++),
      email: `${first.toLowerCase()}${Math.floor(rand() * 999)}@gmail.com`,
      firstName: first,
      lastName: "",
      company: rand() < 0.5 ? "" : pick(["Self employed", "Student", "N/A", "Freelance consulting"]),
      country: "",
      associatedCompanyId: "",
      createDate: dateBetween("2025-09-01", "2026-06-08"),
      firstConversionEvent: pick(FORMS),
      firstConversionDate: dateBetween("2025-09-01", "2026-06-08"),
      recentConversionEvent: "",
      recentConversionDate: "",
      numConversionEvents: 1,
      analyticsSource: pick(["PAID_SEARCH", "SOCIAL_MEDIA", "PAID_SOCIAL"]),
      analyticsSourceData1: "LinkedIn",
      analyticsSourceData2: "am remarketing (all event leads)",
      latestSource: "",
      latestSourceData1: "",
      latestSourceData2: "",
      latestSourceTimestamp: "",
    });
  }
  return contacts;
}

async function main() {
  const { computeSnapshot } = await import("../lib/influence");
  const { saveSnapshot } = await import("../lib/store");
  const { parseEngagementCsv } = await import("../lib/linkedin-csv");
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const started = Date.now();
  const companies = buildCompanies();
  const deals = buildDeals(companies);
  const contacts = buildContacts(companies);
  // Exercise the LinkedIn Company Engagement CSV pathway with the sample file
  const sampleCsv = await readFile(
    join(process.cwd(), "imports", "linkedin-company-engagement.sample.csv"),
    "utf8"
  );
  const companyTouches = parseEngagementCsv(
    "2026-05-15 visnet-abm-engagement.csv",
    sampleCsv,
    new Date("2026-05-15T12:00:00Z")
  );
  console.log(`LinkedIn CSV rows parsed: ${companyTouches.length}`);
  const snapshot = computeSnapshot(companies, deals, contacts, started, companyTouches);
  await saveSnapshot(snapshot);
  console.log("Demo snapshot written.");
  console.log(`  Companies: ${companies.length}, Deals: ${deals.length}, Contacts: ${contacts.length}`);
  console.log(`  Matched contacts: ${snapshot.totals.matchedContacts}/${snapshot.totals.marketingContacts}`);
  console.log(`  Influenced deals: ${snapshot.totals.influencedDeals} (£${Math.round(snapshot.totals.influencedValue).toLocaleString()})`);
  console.log(`  Match methods:`, snapshot.matchMethodCounts);
  console.log(`  Confidence:`, snapshot.confidenceCounts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
