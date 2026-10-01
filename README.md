# Rapport Google Ads

A Next.js page that turns a Google Ads campaign export into the three
report tables: **Rapport Global**, **Total Par Compte** and
**Total Par Service**. Drop the `.xlsx` or `.csv` export on the page; it is
read and aggregated in the browser and never sent to a server.

| Path | What it is |
|---|---|
| `web/app/page.tsx` | The page |
| `web/components/report/` | Drop zone, imported files list, report tables |
| `web/lib/report/parse.ts` | Reads the export (`.xlsx`, `.csv`, `.tsv`) into campaign rows |
| `web/lib/report/rules.ts` | **Categorization rules**: edit this to match your naming |
| `web/lib/report/aggregate.ts` | Groups by Compte, Service, Type and computes costs |
| `vercel.json` | Vercel project config: one public service, `web` |

## Exporting from Google Ads

1. Open **Campaigns**, choose the date range, and make sure the table shows
   the **Campaign**, **Cost** and **Conversions** columns. French or
   English column names both work.
2. Click **Download** and choose **Excel (.xlsx)** or **.csv** (the "Excel
   .csv" UTF-16 variant works too).
3. Export from the manager account to get both comptes in one file (the
   **Account** column is used), or export each account separately and drop
   both files.

The total lines Google Ads adds at the bottom ("Total: Campaigns"...) are
ignored. The same file dropped twice is only counted once.

## How rows are categorized

All three dimensions come from names, using the patterns in
`web/lib/report/rules.ts`:

| Dimension | Values | Read from |
|---|---|---|
| Compte | `CPA`, `ALM` | Account name, else campaign name, else file name. Can be forced per file in the page |
| Service | `Santé`, `Auto` | Campaign name: *santé*, *mutuelle* / *auto*, *voiture*, *véhicule* |
| Type | `Fiches / Leads`, `Appels` | Campaign name: *fiche(s)*, *lead(s)*, *formulaire(s)* / *appel(s)*, *call(s)* |

A campaign's spend and conversions both go to its type. So **Coût / fiche**
is the spend of the Fiches / Leads campaigns divided by their conversions,
and **Coût / appel** is the same for Appels campaigns.

A campaign that matches no value, or two (e.g. "Auto + Santé"), is left out
of the totals. It is listed under **Campagnes non classées** with its spend
and what could not be recognized. Rename the campaign or adjust the
patterns.

The Rapport Global always shows the six rows of the reference report, in
its order. Any other combination with data (e.g. ALM / Auto / Fiches /
Leads) is added, so no spend is hidden.

## Development

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm test        # parsing, period and aggregation tests
npm run lint
```

## Deployment

Import the repository in Vercel and leave **Root Directory** empty:
`vercel.json` declares the `web` service and routes all traffic to it. No
environment variable is needed.

The earlier API pipeline (Python, GitHub Actions, Supabase) was removed. It
is still in the git history, at commit `fbb922a`.
