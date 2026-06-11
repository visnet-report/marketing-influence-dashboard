# LinkedIn Company Engagement Report imports

Drop CSV exports from **LinkedIn Campaign Manager** here to add company-level
visibility touchpoints (paid impressions, ad engagement, organic engagement)
for companies that never submitted a form.

How to export:

1. Campaign Manager → **Plan → Audiences** (or **Analyze → Company engagement
   report** depending on UI version).
2. Select your matched-audience / ABM company list.
3. **Export** the Company Engagement Report as CSV.
4. Save it here with the export date in the filename, e.g.
   `2026-06-01 visnet-abm-engagement.csv` — the date in the filename becomes
   the touchpoint date (falls back to the file's modified time).
5. Re-run the sync (`npm run sync`, or wait for the nightly cron). On Vercel,
   commit the CSV and redeploy.

Parsing is flexible: any CSV with a `Company Name` / `Company` column works.
Optional columns used when present: `Domain`/`Website` (improves match
confidence), `Campaign`, and metrics such as `Engagement Level`, `Impressions`,
`Clicks`, `Ad Engagement`, `Organic Engagement`, `Engagement Rate`,
`Website Visits`.

Rows are matched to CRM companies by domain → exact cleaned name → fuzzy name,
and appear in the dashboard as the **LinkedIn Visibility (Company)** channel.
Files containing `.sample.` in the name are ignored.
