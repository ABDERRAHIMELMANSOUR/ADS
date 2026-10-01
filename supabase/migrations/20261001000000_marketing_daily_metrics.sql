-- =============================================================================
-- Marketing Intelligence: daily aggregated metrics (Google Ads + Meta Ads)
-- =============================================================================
--
-- Grain: one row per (date, plateforme, compte, service, type_conversion).
-- At most 2 x 2 x 2 x 2 = 16 rows per day, so the table stays small and every
-- dashboard query is a range scan on the primary key (which starts with date).
--
-- How spend and conversions get a "type":
--   * conversions take the type of their conversion action
--     (call conversions go to 'Appels', form fills to 'Fiches / Leads');
--   * spend cannot be split by conversion action, so it takes the type of the
--     campaign it was spent on (set by the campaign naming convention).
--   Totals per compte and per service are therefore exact. A cost per
--   conversion *per type* is only as good as the campaign naming convention.
--
-- The pipeline writes with the service-role key, which bypasses RLS. Nothing
-- is granted to the anon / authenticated roles: the data stays server-side.
-- =============================================================================

create table if not exists public.marketing_daily_metrics (
    date            date           not null,
    plateforme      text           not null,
    compte          text           not null,
    service         text           not null,
    type_conversion text           not null,
    depenses        numeric(14, 2) not null default 0,
    conversions     numeric(14, 2) not null default 0,
    -- Set by each pipeline run; rows older than the run in its date window are
    -- stale (e.g. a campaign was renamed into another service) and get deleted.
    synced_at       timestamptz    not null default now(),

    constraint marketing_daily_metrics_pkey
        primary key (date, plateforme, compte, service, type_conversion),
    constraint marketing_daily_metrics_plateforme_check
        check (plateforme in ('google_ads', 'meta_ads')),
    constraint marketing_daily_metrics_compte_check
        check (compte in ('ALM', 'CPA')),
    constraint marketing_daily_metrics_service_check
        check (service in ('Santé', 'Auto')),
    constraint marketing_daily_metrics_type_conversion_check
        check (type_conversion in ('Appels', 'Fiches / Leads')),
    constraint marketing_daily_metrics_depenses_check
        check (depenses >= 0),
    constraint marketing_daily_metrics_conversions_check
        check (conversions >= 0)
);

comment on table public.marketing_daily_metrics is
    'Daily Google Ads / Meta Ads spend and conversions, aggregated by compte, service and conversion type. Loaded nightly by pipeline/ (GitHub Actions).';
comment on column public.marketing_daily_metrics.depenses is
    'Spend in the ad account currency, attributed to the campaign type.';
comment on column public.marketing_daily_metrics.conversions is
    'Conversions (can be fractional with data-driven attribution), attributed to the conversion action type.';

alter table public.marketing_daily_metrics enable row level security;
revoke all on table public.marketing_daily_metrics from anon, authenticated;


-- -----------------------------------------------------------------------------
-- get_marketing_totals: dashboard totals grouped by compte or by service
-- -----------------------------------------------------------------------------
-- Called from the Next.js server with:
--   supabase.rpc('get_marketing_totals',
--                { p_group_by: 'compte', p_date_from: '2026-09-01', p_date_to: '2026-09-30' })
-- -----------------------------------------------------------------------------
create or replace function public.get_marketing_totals(
    p_group_by  text,
    p_date_from date,
    p_date_to   date
)
returns table (
    dimension           text,
    depenses            numeric,
    conversions_appels  numeric,
    conversions_leads   numeric,
    conversions_total   numeric,
    cout_par_conversion numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
    if p_group_by is null or p_group_by not in ('compte', 'service') then
        raise exception 'p_group_by must be ''compte'' or ''service'', got %', p_group_by
            using errcode = '22023';  -- invalid_parameter_value
    end if;

    return query
    select
        g.dimension,
        g.depenses,
        g.conversions_appels,
        g.conversions_leads,
        g.conversions_appels + g.conversions_leads,
        round(g.depenses / nullif(g.conversions_appels + g.conversions_leads, 0), 2)
    from (
        select
            case p_group_by when 'compte' then m.compte else m.service end as dimension,
            sum(m.depenses) as depenses,
            coalesce(sum(m.conversions) filter (where m.type_conversion = 'Appels'), 0)
                as conversions_appels,
            coalesce(sum(m.conversions) filter (where m.type_conversion = 'Fiches / Leads'), 0)
                as conversions_leads
        from public.marketing_daily_metrics as m
        where m.date between p_date_from and p_date_to
        group by 1
    ) as g
    order by g.dimension;
end;
$$;

comment on function public.get_marketing_totals(text, date, date) is
    'Spend, conversions by type and cost per conversion over [p_date_from, p_date_to], grouped by compte or service.';

revoke execute on function public.get_marketing_totals(text, date, date)
    from public, anon, authenticated;
grant execute on function public.get_marketing_totals(text, date, date)
    to service_role;
