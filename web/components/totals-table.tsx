import { formatCostPerConversion, formatCount, formatCurrency } from "@/lib/format";
import type { Totals, TotalsRow } from "@/lib/metrics";

type Column = {
  label: string;
  value: (totals: Totals) => string;
};

const COLUMNS: Column[] = [
  { label: "Dépenses", value: (t) => formatCurrency(t.depenses) },
  { label: "Appels", value: (t) => formatCount(t.conversionsAppels) },
  { label: "Fiches / Leads", value: (t) => formatCount(t.conversionsLeads) },
  { label: "Total conversions", value: (t) => formatCount(t.conversionsTotal) },
  { label: "Coût / conversion", value: (t) => formatCostPerConversion(t.coutParConversion) },
];

type TotalsTableProps = {
  title: string;
  dimensionLabel: string;
  rows: TotalsRow[];
  total: Totals;
};

export function TotalsTable({ title, dimensionLabel, rows, total }: TotalsTableProps) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <h2 className="px-5 pt-4 pb-3 text-base font-semibold text-ink">{title}</h2>
      <div className="overflow-x-auto">
        {/* Fixed layout so both tables on the page share the same column grid. */}
        <table className="w-full min-w-[44rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border whitespace-nowrap text-ink-secondary">
              <th scope="col" className="px-5 py-2.5 text-left font-medium">
                {dimensionLabel}
              </th>
              {COLUMNS.map((column) => (
                <th key={column.label} scope="col" className="px-5 py-2.5 text-right font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-8 text-center text-ink-muted">
                  Aucune donnée sur cette période.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.dimension} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-5 py-3 text-left font-medium text-ink">
                    {row.dimension}
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.label} className="px-5 py-3 text-right text-ink">
                      {column.value(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="tabular-nums">
              <tr className="border-t border-border font-semibold text-ink">
                <th scope="row" className="px-5 py-3 text-left">
                  Total
                </th>
                {COLUMNS.map((column) => (
                  <td key={column.label} className="px-5 py-3 text-right">
                    {column.value(total)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
