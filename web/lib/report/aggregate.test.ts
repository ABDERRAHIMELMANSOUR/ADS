import { describe, expect, it } from "vitest";

import { buildReport } from "./aggregate";
import type { CampaignRow } from "./parse";
import { classifyCompte, classifyService, classifyType } from "./rules";

const row = (campaign: string, depenses: number, conversions: number, account: string | null = null): CampaignRow => ({
  campaign,
  account,
  depenses,
  conversions,
});

describe("rules", () => {
  it("reads the compte from the account, then the campaign, then the file name", () => {
    expect(classifyCompte("ALM Assurances", "CPA | Santé")).toBe("ALM");
    expect(classifyCompte(null, "CPA | Santé | Leads")).toBe("CPA");
    expect(classifyCompte(null, "Santé - tCPA", "export_alm_sept.csv")).toBe("ALM");
    expect(classifyCompte(null, "Santé", "export.csv")).toBeNull();
  });

  it("needs exactly one service and one type", () => {
    expect(classifyService("CPA_Mutuelle-Seniors")).toBe("Santé");
    expect(classifyService("ALM | Assurance voiture")).toBe("Auto");
    expect(classifyService("Pack Auto + Santé")).toBeNull();
    expect(classifyType("CPA | Santé | Appels")).toBe("Appels");
    expect(classifyType("CPA | Santé | Leads")).toBe("Fiches / Leads");
    expect(classifyType("CPA | Santé | Demande de rappel")).toBeNull();
  });
});

describe("buildReport", () => {
  it("keeps the reference rows and order, and adds other combinations with data", () => {
    const report = buildReport([
      {
        fileName: "export.csv",
        compte: "auto",
        rows: [
          row("CPA | Santé | Leads", 100, 4),
          row("CPA | Santé | Leads 2", 50, 1),
          row("ALM | Auto | Leads", 30, 3),
        ],
      },
    ]);

    expect(report.global.map((r) => [r.compte, r.service, r.type, r.depenses, r.conversions])).toEqual([
      ["CPA", "Santé", "Fiches / Leads", 150, 5],
      ["CPA", "Santé", "Appels", 0, 0],
      ["CPA", "Auto", "Appels", 0, 0],
      ["ALM", "Santé", "Fiches / Leads", 0, 0],
      ["ALM", "Santé", "Appels", 0, 0],
      ["ALM", "Auto", "Fiches / Leads", 30, 3],
      ["ALM", "Auto", "Appels", 0, 0],
    ]);
    expect(report.global[0].coutParConversion).toBe(30);
    expect(report.global[1].coutParConversion).toBeNull();
    expect(report.total).toEqual({ depenses: 180, conversions: 8, coutParConversion: 22.5 });
  });

  it("splits totals into fiches and appels with a cost per type", () => {
    const report = buildReport([
      {
        fileName: "export.csv",
        compte: "auto",
        rows: [
          row("CPA | Santé | Fiches", 200, 10),
          row("CPA | Santé | Appels", 90, 3),
          row("CPA | Auto | Appels", 60, 2),
          row("ALM | Santé | Appels", 40, 0),
        ],
      },
    ]);

    expect(report.parCompte).toEqual([
      { key: "CPA", depenses: 350, fiches: 10, appels: 5, coutParFiche: 20, coutParAppel: 30 },
      { key: "ALM", depenses: 40, fiches: 0, appels: 0, coutParFiche: null, coutParAppel: null },
    ]);
    expect(report.parService).toEqual([
      { key: "Santé", depenses: 330, fiches: 10, appels: 3, coutParFiche: 20, coutParAppel: 130 / 3 },
      { key: "Auto", depenses: 60, fiches: 0, appels: 2, coutParFiche: null, coutParAppel: 30 },
    ]);
  });

  it("lists unclassified campaigns with what is missing, outside the totals", () => {
    const report = buildReport([
      {
        fileName: "export.csv",
        compte: "auto",
        rows: [row("Marque - Search", 25, 1), row("Marque - Search", 5, 0), row("CPA | Auto", 10, 1)],
      },
    ]);

    expect(report.unclassified).toEqual([
      { campaign: "Marque - Search", account: null, missing: ["Compte", "Service", "Type"], depenses: 30, conversions: 1 },
      { campaign: "CPA | Auto", account: null, missing: ["Type"], depenses: 10, conversions: 1 },
    ]);
    expect(report.unclassifiedTotal).toEqual({ depenses: 40, conversions: 2 });
    expect(report.total.depenses).toBe(0);
  });

  it("applies the compte chosen for a file to all its rows", () => {
    const report = buildReport([
      { fileName: "export.csv", compte: "ALM", rows: [row("Santé | Leads", 10, 1), row("CPA | Santé | Leads", 5, 1)] },
    ]);

    expect(report.parCompte.find((r) => r.key === "ALM")?.depenses).toBe(15);
    expect(report.unclassified).toEqual([]);
  });
});
