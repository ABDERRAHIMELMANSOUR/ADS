import type { CampaignRow } from "./parse";
import {
  COMPTES,
  SERVICES,
  TYPES,
  type Compte,
  type Service,
  type TypeConversion,
  classifyCompte,
  classifyService,
  classifyType,
} from "./rules";

export type Metrics = { depenses: number; conversions: number };

/** Rapport Global: one row per compte, service and type. */
export type GlobalRow = Metrics & {
  compte: Compte;
  service: Service;
  type: TypeConversion;
  coutParConversion: number | null;
};

/** Total Par Compte / Total Par Service. */
export type SplitRow<Key extends string> = {
  key: Key;
  depenses: number;
  fiches: number;
  appels: number;
  /** Spend of the "Fiches / Leads" campaigns divided by their conversions. */
  coutParFiche: number | null;
  /** Spend of the "Appels" campaigns divided by their conversions. */
  coutParAppel: number | null;
};

export type UnclassifiedRow = Metrics & {
  campaign: string;
  account: string | null;
  missing: ("Compte" | "Service" | "Type")[];
};

export type Report = {
  global: GlobalRow[];
  total: Metrics & { coutParConversion: number | null };
  parCompte: SplitRow<Compte>[];
  parService: SplitRow<Service>[];
  unclassified: UnclassifiedRow[];
  unclassifiedTotal: Metrics;
};

export type ReportInput = {
  fileName: string;
  rows: CampaignRow[];
  /** "auto" reads the compte from the account, campaign or file name. */
  compte: Compte | "auto";
};

/** Rows of the reference report, shown even when they are empty. */
const TEMPLATE_ROWS = new Set([
  "CPA|Santé|Fiches / Leads",
  "CPA|Santé|Appels",
  "CPA|Auto|Appels",
  "ALM|Santé|Fiches / Leads",
  "ALM|Santé|Appels",
  "ALM|Auto|Appels",
]);

const costPer = (depenses: number, conversions: number) =>
  conversions > 0 ? depenses / conversions : null;

const keyOf = (compte: Compte, service: Service, type: TypeConversion) =>
  `${compte}|${service}|${type}`;

export function buildReport(inputs: ReportInput[]): Report {
  const cells = new Map<string, Metrics>();
  const unclassified = new Map<string, UnclassifiedRow>();

  for (const input of inputs) {
    for (const row of input.rows) {
      const compte =
        input.compte === "auto" ? classifyCompte(row.account, row.campaign, input.fileName) : input.compte;
      const service = classifyService(row.campaign);
      const type = classifyType(row.campaign);

      if (compte && service && type) {
        const cell = cells.get(keyOf(compte, service, type)) ?? { depenses: 0, conversions: 0 };
        cell.depenses += row.depenses;
        cell.conversions += row.conversions;
        cells.set(keyOf(compte, service, type), cell);
        continue;
      }

      const missing: UnclassifiedRow["missing"] = [];
      if (!compte) missing.push("Compte");
      if (!service) missing.push("Service");
      if (!type) missing.push("Type");
      const id = `${row.account ?? ""}|${row.campaign}`;
      const entry = unclassified.get(id) ?? { campaign: row.campaign, account: row.account, missing, depenses: 0, conversions: 0 };
      entry.depenses += row.depenses;
      entry.conversions += row.conversions;
      unclassified.set(id, entry);
    }
  }

  const global: GlobalRow[] = [];
  for (const compte of COMPTES) {
    for (const service of SERVICES) {
      for (const type of TYPES) {
        const key = keyOf(compte, service, type);
        const metrics = cells.get(key);
        // Combinations outside the reference report still show up when they
        // have data, so no spend is ever hidden.
        if (!metrics && !TEMPLATE_ROWS.has(key)) continue;
        const { depenses, conversions } = metrics ?? { depenses: 0, conversions: 0 };
        global.push({ compte, service, type, depenses, conversions, coutParConversion: costPer(depenses, conversions) });
      }
    }
  }

  const total = sum(global);
  const unclassifiedRows = [...unclassified.values()].sort((a, b) => b.depenses - a.depenses);

  return {
    global,
    total: { ...total, coutParConversion: costPer(total.depenses, total.conversions) },
    parCompte: COMPTES.map((compte) => split(compte, global.filter((row) => row.compte === compte))),
    parService: SERVICES.map((service) => split(service, global.filter((row) => row.service === service))),
    unclassified: unclassifiedRows,
    unclassifiedTotal: sum(unclassifiedRows),
  };
}

function sum(rows: Metrics[]): Metrics {
  return rows.reduce(
    (acc, row) => ({ depenses: acc.depenses + row.depenses, conversions: acc.conversions + row.conversions }),
    { depenses: 0, conversions: 0 },
  );
}

function split<Key extends string>(key: Key, rows: GlobalRow[]): SplitRow<Key> {
  const fiches = sum(rows.filter((row) => row.type === "Fiches / Leads"));
  const appels = sum(rows.filter((row) => row.type === "Appels"));
  return {
    key,
    depenses: fiches.depenses + appels.depenses,
    fiches: fiches.conversions,
    appels: appels.conversions,
    coutParFiche: costPer(fiches.depenses, fiches.conversions),
    coutParAppel: costPer(appels.depenses, appels.conversions),
  };
}
