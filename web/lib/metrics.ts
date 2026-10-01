import "server-only";

import type { DateRange } from "./date-range";
import { getSupabaseServerClient } from "./supabase-server";

export type GroupBy = "compte" | "service";

export type Totals = {
  depenses: number;
  conversionsAppels: number;
  conversionsLeads: number;
  conversionsTotal: number;
  /** null when there is no conversion in the period. */
  coutParConversion: number | null;
};

export type TotalsRow = Totals & { dimension: string };

/** Row shape returned by public.get_marketing_totals (see supabase/migrations). */
type TotalsRpcRow = {
  dimension: string;
  depenses: number;
  conversions_appels: number;
  conversions_leads: number;
  conversions_total: number;
  cout_par_conversion: number | null;
};

/** Totals grouped in Postgres by compte or by service over the date range. */
export async function getTotals(groupBy: GroupBy, range: DateRange): Promise<TotalsRow[]> {
  const { data, error } = await getSupabaseServerClient().rpc("get_marketing_totals", {
    p_group_by: groupBy,
    p_date_from: range.from,
    p_date_to: range.to,
  });
  if (error) {
    throw new Error(`get_marketing_totals(${groupBy}) failed: ${error.message}`);
  }

  return ((data ?? []) as TotalsRpcRow[]).map((row) => ({
    dimension: row.dimension,
    depenses: Number(row.depenses),
    conversionsAppels: Number(row.conversions_appels),
    conversionsLeads: Number(row.conversions_leads),
    conversionsTotal: Number(row.conversions_total),
    coutParConversion: row.cout_par_conversion === null ? null : Number(row.cout_par_conversion),
  }));
}

/** Grand total of grouped rows (identical whichever dimension they are grouped by). */
export function sumTotals(rows: TotalsRow[]): Totals {
  const depenses = rows.reduce((sum, row) => sum + row.depenses, 0);
  const conversionsAppels = rows.reduce((sum, row) => sum + row.conversionsAppels, 0);
  const conversionsLeads = rows.reduce((sum, row) => sum + row.conversionsLeads, 0);
  const conversionsTotal = conversionsAppels + conversionsLeads;
  return {
    depenses,
    conversionsAppels,
    conversionsLeads,
    conversionsTotal,
    coutParConversion: conversionsTotal > 0 ? depenses / conversionsTotal : null,
  };
}

/** Time of the last successful pipeline load, or null if the table is empty. */
export async function getLastSyncedAt(): Promise<Date | null> {
  const { data, error } = await getSupabaseServerClient()
    .from("marketing_daily_metrics")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ synced_at: string }>();
  if (error) {
    throw new Error(`Reading the last sync time failed: ${error.message}`);
  }
  return data ? new Date(data.synced_at) : null;
}
