# Marketing Intelligence

A serverless replacement for Supermetrics. Every night it pulls Google Ads and
Meta Ads data, aggregates it by **Compte**, **Service** and **Type**, stores it
in Supabase, and serves a dashboard from Vercel.

```
GitHub Actions (02:00 UTC)                 Supabase (Postgres)              Vercel (Next.js)
┌───────────────────────────┐   upsert    ┌──────────────────────────┐ rpc ┌──────────────────────┐
│ pipeline/  (Python)       │ ──────────▶ │ marketing_daily_metrics  │ ◀── │ web/app/page.tsx     │
│  Google Ads API (GAQL)    │             │ get_marketing_totals()   │     │ Server Component     │
│  Meta Insights API        │             └──────────────────────────┘     │ Total Par Compte     │
│  pandas aggregation       │                                              │ Total Par Service    │
└───────────────────────────┘                                              └──────────────────────┘
```

| Path | What it is |
|---|---|
| `supabase/migrations/` | Table, constraints, RLS and the `get_marketing_totals` function |
| `pipeline/` | Python extract → aggregate → load (`python -m pipeline`) |
| `pipeline/rules.py` | **The categorization rules**: edit this to match your naming |
| `.github/workflows/data-pipeline.yml` | Nightly cron + manual runs / backfills |
| `web/` | Next.js dashboard (App Router, Tailwind) |
| `vercel.json` | Vercel project config: the `web` service and its public route |

## Data model

One row per `date × plateforme × compte × service × type_conversion` (at most
16 rows a day), with `depenses` and `conversions`. The values are fixed by
CHECK constraints:

| Dimension | Values | Comes from |
|---|---|---|
| `compte` | `ALM`, `CPA` | The ad account (`GOOGLE_ADS_ACCOUNTS`, `META_AD_ACCOUNTS`) |
| `service` | `Santé`, `Auto` | The campaign name (`SERVICE_PATTERNS` in `rules.py`) |
| `type_conversion` | `Appels`, `Fiches / Leads` | Conversions: the conversion action. Spend: the campaign name |

**How spend gets a type.** An ad platform cannot split a campaign's cost by
conversion action. So **conversions** are typed by their action: Google Ads
`PHONE_CALL_LEAD` actions, or Meta `click_to_call_native_call_placed`, count
as `Appels`; the rest count as `Fiches / Leads`. **Spend** takes the type of
its campaign: names containing *appel(s)* or *call(s)* count as `Appels`, the
rest as `Fiches / Leads`. Totals per compte and per service are exact either
way. Cost per conversion *per type* is only as reliable as your campaign naming.

**Unclassified campaigns.** A campaign whose name matches no service (or
both) is not loaded. The run reports it as a warning, with its spend, in the
GitHub Actions run summary. Fix it in `pipeline/rules.py`, or pass
`--fail-on-unclassified` to make the run fail instead.

**Re-syncs.** Every run re-syncs the last 30 days, because conversions keep
being credited to past clicks. The load is idempotent: rows are upserted on
the primary key, then rows in the window that this run did not write are
deleted (for example after a campaign was renamed into another service).

## Setup

### 1. Supabase

Apply the migration, either with the CLI (`supabase db push`) or by pasting
`supabase/migrations/20261001000000_marketing_daily_metrics.sql` into the SQL
editor. RLS is enabled and nothing is granted to `anon` / `authenticated`, so
the data can only be read with the service-role key, server-side.

### 2. GitHub secrets

In *Settings → Secrets and variables → Actions*, add:

| Secret | Notes |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Needs at least *Basic* access to read production accounts |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` | OAuth client and a refresh token for a user who can read both accounts |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional: the manager (MCC) id, if access goes through one |
| `GOOGLE_ADS_ACCOUNTS` | `ALM=123-456-7890,CPA=098-765-4321` (several ids per compte allowed) |
| `META_ACCESS_TOKEN` | A **system user** token with `ads_read`, so it does not expire |
| `META_APP_ID`, `META_APP_SECRET` | Optional: enables `appsecret_proof` |
| `META_AD_ACCOUNTS` | `ALM=act_1234567890,CPA=act_0987654321` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Project URL and service-role (or `sb_secret_…`) key |

Then load history once: *Actions → Data pipeline → Run workflow*, with a
`start_date` (e.g. `2025-01-01`). After that, the cron keeps the last 30 days fresh.

### 3. Vercel

Import the repository and leave **Root Directory** empty: `vercel.json`
declares one service, `web` (the Next.js app in `web/`), and sends all
public traffic (`/(.*)`) to it. The pipeline is not a Vercel service; it
keeps running on GitHub Actions. Add the `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` environment variables to the project (no
`NEXT_PUBLIC_` prefix). The page shows spend data to anyone who can open
it, so put it behind Vercel Deployment Protection or your own authentication.

`vercel build` checks the configuration locally; `vercel dev` runs the
project the way Vercel routes it.

## Local development

```bash
# Pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements-dev.txt
python -m pytest pipeline
set -a && source .env && set +a          # copy .env.example to .env first
python -m pipeline --dry-run --lookback-days 7
python -m pipeline --start 2026-01-01 --end 2026-09-30 --sources google_ads

# Dashboard
cd web && cp .env.example .env.local && npm install && npm run dev
```

The dashboard reads `?preset=7j|30j|mois|mois-precedent` or
`?from=YYYY-MM-DD&to=YYYY-MM-DD` from the URL. The default is the last 30 complete days.

## Operations

- **Schedule.** GitHub cron runs in UTC; see the comment in the workflow to
  run at 02:00 Paris time instead. In a public repository, GitHub pauses
  scheduled workflows after 60 days without repository activity.
- **Failures.** If one platform fails, the other still loads, and the run is
  marked failed so GitHub emails you.
- **Upgrades.** Google retires Google Ads API versions about once a year:
  bump `google-ads` in `pipeline/requirements.txt` before that happens.
- **Currency.** Spend is stored in each ad account's currency; the dashboard
  formats it as EUR (`web/lib/format.ts`).
