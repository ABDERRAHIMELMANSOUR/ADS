import type { ReactNode } from "react";

import { formatAmount, formatCost, formatCount } from "@/lib/format";
import type { GlobalRow, Report, SplitRow, UnclassifiedRow } from "@/lib/report/aggregate";

type Column<Row> = {
  label: string;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  title: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Bold TOTAL line below the rows: one cell per column. */
  footer?: ReactNode[];
  caption?: ReactNode;
};

function DataTable<Row>({ title, columns, rows, rowKey, footer, caption }: DataTableProps<Row>) {
  const cellClass = (numeric?: boolean) => `whitespace-nowrap px-4 py-2.5 ${numeric ? "text-right" : "text-left"}`;
  return (
    <section className="rounded-xl border border-border bg-surface">
      <h2 className="px-4 pt-4 pb-3 text-base font-semibold text-ink">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-y border-border text-ink-secondary">
              {columns.map((column) => (
                <th key={column.label} scope="col" className={`${cellClass(column.numeric)} font-medium`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums text-ink">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
                {columns.map((column) => (
                  <td key={column.label} className={cellClass(column.numeric)}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot className="tabular-nums">
              <tr className="border-t border-border font-semibold text-ink">
                {columns.map((column, index) => (
                  <td key={column.label} className={cellClass(column.numeric)}>
                    {footer[index]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {caption && <p className="border-t border-border px-4 py-2.5 text-xs text-ink-muted">{caption}</p>}
    </section>
  );
}

const globalColumns: Column<GlobalRow>[] = [
  { label: "Compte", render: (row) => row.compte },
  { label: "Service", render: (row) => row.service },
  { label: "Type", render: (row) => row.type },
  { label: "Dépenses (€)", numeric: true, render: (row) => formatAmount(row.depenses) },
  { label: "Conversions", numeric: true, render: (row) => formatCount(row.conversions) },
  { label: "Coût / conversion (€)", numeric: true, render: (row) => formatCost(row.coutParConversion) },
];

export function RapportGlobalTable({ report }: { report: Report }) {
  return (
    <DataTable
      title="Rapport Global"
      columns={globalColumns}
      rows={report.global}
      rowKey={(row) => `${row.compte}|${row.service}|${row.type}`}
      footer={[
        "TOTAL",
        null,
        null,
        formatAmount(report.total.depenses),
        formatCount(report.total.conversions),
        formatCost(report.total.coutParConversion),
      ]}
    />
  );
}

function splitColumns<Key extends string>(dimension: string): Column<SplitRow<Key>>[] {
  return [
    { label: dimension, render: (row) => row.key },
    { label: "Dépenses (€)", numeric: true, render: (row) => formatAmount(row.depenses) },
    { label: "Fiches / Leads", numeric: true, render: (row) => formatCount(row.fiches) },
    { label: "Appels", numeric: true, render: (row) => formatCount(row.appels) },
    { label: "Coût / fiche", numeric: true, render: (row) => formatCost(row.coutParFiche, { withSymbol: true }) },
    { label: "Coût / appel", numeric: true, render: (row) => formatCost(row.coutParAppel, { withSymbol: true }) },
  ];
}

const SPLIT_CAPTION =
  "Coût / fiche : dépenses des campagnes Fiches / Leads ÷ fiches. Coût / appel : dépenses des campagnes Appels ÷ appels.";

export function TotalParCompteTable({ report }: { report: Report }) {
  return (
    <DataTable
      title="Total Par Compte"
      columns={splitColumns("Compte")}
      rows={report.parCompte}
      rowKey={(row) => row.key}
      caption={SPLIT_CAPTION}
    />
  );
}

export function TotalParServiceTable({ report }: { report: Report }) {
  return (
    <DataTable
      title="Total Par Service"
      columns={splitColumns("Service")}
      rows={report.parService}
      rowKey={(row) => row.key}
      caption={SPLIT_CAPTION}
    />
  );
}

const unclassifiedColumns: Column<UnclassifiedRow>[] = [
  { label: "Campagne", render: (row) => row.campaign },
  { label: "Compte Google Ads", render: (row) => row.account ?? "—" },
  { label: "Non reconnu", render: (row) => row.missing.join(", ") },
  { label: "Dépenses (€)", numeric: true, render: (row) => formatAmount(row.depenses) },
  { label: "Conversions", numeric: true, render: (row) => formatCount(row.conversions) },
];

export function UnclassifiedTable({ report }: { report: Report }) {
  return (
    <DataTable
      title="Campagnes non classées (exclues des totaux)"
      columns={unclassifiedColumns}
      rows={report.unclassified}
      rowKey={(row) => `${row.account ?? ""}|${row.campaign}`}
      footer={[
        "TOTAL",
        null,
        null,
        formatAmount(report.unclassifiedTotal.depenses),
        formatCount(report.unclassifiedTotal.conversions),
      ]}
      caption="Le compte, le service et le type sont lus dans le nom de la campagne (règles dans web/lib/report/rules.ts). Renommez la campagne ou ajustez les règles pour l'inclure."
    />
  );
}
