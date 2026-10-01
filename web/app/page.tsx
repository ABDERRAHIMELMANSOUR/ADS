import { DateRangeFilter } from "@/components/date-range-filter";
import { TotalsTable } from "@/components/totals-table";
import { resolveDateRange } from "@/lib/date-range";
import {
  formatCostPerConversion,
  formatCount,
  formatCurrency,
  formatDay,
  formatTimestamp,
} from "@/lib/format";
import { getLastSyncedAt, getTotals, sumTotals } from "@/lib/metrics";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const range = resolveDateRange(await searchParams);

  // Grouping happens in Postgres (get_marketing_totals); both reads run in parallel.
  const [parCompte, parService, lastSyncedAt] = await Promise.all([
    getTotals("compte", range),
    getTotals("service", range),
    getLastSyncedAt(),
  ]);
  const total = sumTotals(parCompte);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Marketing Intelligence</h1>
        <p className="text-sm text-ink-secondary">
          Google Ads et Meta Ads · du {formatDay(range.from)} au {formatDay(range.to)}
          {lastSyncedAt && <> · Dernière synchronisation : {formatTimestamp(lastSyncedAt)}</>}
        </p>
      </header>

      <DateRangeFilter range={range} />

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Dépenses" value={formatCurrency(total.depenses)} />
        <Kpi
          label="Conversions"
          value={formatCount(total.conversionsTotal)}
          detail={`${formatCount(total.conversionsAppels)} appels · ${formatCount(total.conversionsLeads)} fiches / leads`}
        />
        <Kpi label="Coût par conversion" value={formatCostPerConversion(total.coutParConversion)} />
      </dl>

      <TotalsTable title="Total Par Compte" dimensionLabel="Compte" rows={parCompte} total={total} />
      <TotalsTable title="Total Par Service" dimensionLabel="Service" rows={parService} total={total} />
    </main>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink">{value}</dd>
      {detail && <dd className="mt-1 text-xs text-ink-muted">{detail}</dd>}
    </div>
  );
}
