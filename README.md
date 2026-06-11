# Marketing Influence Dashboard

Proves marketing contribution to pipeline and deals by matching **HubSpot deal
companies** to **marketing-engaged contacts** (form submissions, paid search,
paid social/LinkedIn, organic social, organic search, email), with tiered
matching (Company ID → email domain → exact cleaned name → fuzzy name) and
deal-lifecycle influence rules.

Built for the EA Technology HubSpot portal (EU1, GBP, ~44.6k deals, ~8.1k
companies, ~2.5k marketing-engaged contacts).

## How it works

```
HubSpot (Private App token)
  ├─ Companies   (name, domain, website, country, zip)
  ├─ Deals       (+ company associations, stage labels from pipeline API)
  └─ Contacts    (form conversions, original/latest traffic source, campaigns)
        │
        ▼  daily cron 04:30 UK  (/api/cron/sync)
  Matching engine ──► Influence engine ──► snapshot JSON (Vercel Blob / data/)
        │
        ▼
  Next.js dashboard  (Overview · Influenced Deals · Companies · Matching Audit)
```

### Matching logic (tiered)

| Tier | Method | Confidence |
|---|---|---|
| 1 | HubSpot contact→company association (Company ID) | High |
| 2 | Corporate email domain = company domain/website (free providers excluded) | High |
| 3 | Exact name after cleaning (Ltd, Limited, LLC, Inc, Group, Holdings, The, Plc, Services, Solutions, …) | High if country/domain corroborates, else Medium |
| 4 | Fuzzy name (Jaro-Winkler + token-set, threshold 0.88) | High/Medium/Low based on score + corroboration; rejected if country conflicts |

“EA Technology Ltd” → “EA Technology” matches at Tier 3 (exact after cleaning).
Typos like “EA Tecnology” match at Tier 4. Tune the lists/thresholds in
`lib/config.ts`.

### Influence rules

- A touchpoint influences a deal of the matched company if it falls **before
  the deal's close date** (closed/won deals halt there) or **before now** for
  open deals — touches after creation count as in-flight influence.
- Lookback window before deal creation: `INFLUENCE_LOOKBACK_DAYS` (default 730).
- All deals of a company are evaluated independently — multiple deals and
  multiple activities per company are all shown.
- Views: **all-touch** (every touching channel gets credit), **first-touch**,
  **last-touch** (last touch before creation, falling back to last eligible).

### Touchpoint sources (v1)

| Channel | Source in HubSpot |
|---|---|
| Form submissions | `first_conversion_*`, `recent_conversion_*` contact properties |
| Paid search | `hs_analytics_source` / `hs_latest_source` = PAID_SEARCH (+ campaign drill-downs) |
| Paid LinkedIn (Contact) | …= PAID_SOCIAL (+ LinkedIn campaign name) |
| Organic LinkedIn (Contact) | …= SOCIAL_MEDIA (+ post/campaign reference) |
| Organic search / Email / Referrals / AI Referrals / Direct Traffic / Other | corresponding source values (only OFFLINE is excluded — imported/sales-created records, not visits) |
| **Organic LinkedIn Visibility (Company)** | HubSpot **Buyer Intent company lists** via `HUBSPOT_LIST_TOUCHES` (members become touches dated when they joined the list; needs `crm.lists.read` scope), or CSV uploads via the Data Imports tab |
| **LinkedIn Visibility (Company)** | Two feeds, same channel: (a) **automated** — LinkedIn Ads API `adAnalytics` pivoted by member company, pulled on every nightly sync when `LINKEDIN_*` env vars are set (paid impressions/clicks/engagements per company per day); (b) **uploaded** — Company Engagement Report CSVs via the dashboard's **Data Imports** tab (stored in Vercel Blob; the only source that also covers *organic* company engagement) |
| **Organic Social (uploads)** | Company-level organic engagement CSVs uploaded via the **Data Imports** tab with the "Organic Social" channel — engager exports, social listening reports, event lists. Any CSV with a `Company Name`/`Company` column works; optional `Domain` improves match confidence |

## Setup

### 1. Create a HubSpot Private App

Settings → Integrations → Private Apps → Create. Scopes:
`crm.objects.companies.read`, `crm.objects.deals.read`,
`crm.objects.contacts.read`, `crm.schemas.deals.read`.

### 2. Configure environment

```bash
cp .env.example .env.local   # then fill in HUBSPOT_ACCESS_TOKEN etc.
```

The portal is EU-hosted, so keep `HUBSPOT_API_BASE=https://api-eu1.hubapi.com`.

### 3. Run locally

```bash
npm install
npm run sync     # pull live HubSpot data → data/snapshot.json (or: npm run demo)
npm run dev      # dashboard at http://localhost:3000
```

### 4. Deploy to Vercel (daily 04:30 UK refresh)

```bash
npm i -g vercel
vercel link
vercel blob store add          # adds BLOB_READ_WRITE_TOKEN for snapshot storage
vercel env add HUBSPOT_ACCESS_TOKEN
vercel env add HUBSPOT_API_BASE        # https://api-eu1.hubapi.com
vercel env add CRON_SECRET             # long random string
vercel env add DASHBOARD_PASSWORD      # optional UI basic-auth
vercel deploy --prod
```

`vercel.json` schedules `/api/cron/sync` at `30 3 * * *` UTC (= 04:30 BST,
03:30 GMT in winter). Vercel sends `Authorization: Bearer $CRON_SECRET`
automatically. Trigger manually any time:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/sync
```

**Alternative without Vercel:** run `npm run sync` via Windows Task Scheduler
daily at 04:30 and host `npm start` on any internal server.

## Dashboard tabs

- **Overview** — influenced deals/pipeline/won-revenue KPIs, channel
  contribution with all/first/last-touch toggle, monthly trend.
- **Influenced Deals** — every influenced deal with company, channels, match
  method + confidence, first activity, last activity before deal, created date,
  stage, value, country; expandable touchpoint timeline; CSV export.
- **Companies** — per-company rollup (contacts, touches, deal counts/values,
  first/last touch) with activity timeline.
- **Matching Audit** — match-rate, method/confidence breakdown, and unmatched
  marketing contacts (data-quality worklist; CSV export).

## Known limitations & roadmap

1. **Form submissions** use first + most-recent conversion per contact (full
   per-submission history needs the Events/Forms APIs — add
   `business-intelligence` scope and extend `lib/hubspot.ts` if you need every
   submission as a separate touch).
2. **LinkedIn paid visibility is automated** via the Advertising API
   (`lib/linkedin-api.ts`): one-time setup is create a LinkedIn developer app,
   get the **Advertising API** product approved (Development tier suffices for
   read-only reporting), add redirect URL `http://localhost:8976/callback`,
   then run `npm run linkedin-auth` and copy the printed tokens into env vars.
   The nightly sync then pulls company-level impressions/clicks daily, with
   auto-refreshing tokens (re-run the auth script roughly yearly when the
   refresh token expires). Caveats: LinkedIn adds ±3/day privacy noise to
   company-pivot metrics (`LINKEDIN_MIN_IMPRESSIONS` filters dust), and very
   small segments may be withheld entirely.
   **Organic company engagement has no API** — no LinkedIn endpoint reveals
   which companies viewed/engaged organic posts (engager employers are
   privacy-restricted). The Company Engagement Report CSV in `imports/`
   remains the only organic company-level source. Company-level visibility
   for **Google/Microsoft ads does not exist** on those platforms; the only
   proxy is reverse-IP website visitor identification
   (Dealfront/Leadfeeder/Clearbit Reveal).
3. **Original-source touches are dated at contact creation** (HubSpot does not
   timestamp the first session separately); latest-source touches use
   `hs_latest_source_timestamp`.
4. Country values in the portal are messy (“usa”, “england”, “united kingdom”) —
   normalization map in `lib/config.ts` (`COUNTRY_ALIASES`) handles common
   aliases; extend as needed.
5. Optional phase 2: write `marketing_influenced`, `influence_channels`,
   `first_touch_date` back to HubSpot deal properties via a small write-back
   job, so HubSpot-native reports/lists can use the same logic.
