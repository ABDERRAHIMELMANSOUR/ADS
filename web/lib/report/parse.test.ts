import { describe, expect, it } from "vitest";

import { ExportFormatError, decodeText, parseDelimitedText, toNumber } from "./parse";

// Shape of a Google Ads "Campaigns" report downloaded as .csv (English UI).
const ENGLISH_CSV = `Campaign report
"September 1, 2026 - September 30, 2026"
Campaign status,Campaign,Account,Campaign type,Impr.,Clicks,Cost,Conversions,Cost / conv.,Currency code
Enabled,CPA | Santé | Leads,CPA Courtage,Search,"12,034",842,"1,234.56",40.50,30.48,EUR
Enabled,CPA | Auto | Appels,CPA Courtage,Search,5000,300,600.00,12.00,50.00,EUR
Paused,ALM | Santé | Appels,ALM Assurances,Search,100,10,--,--,--,EUR
Total: Account,--,--,--,"17,134","1,152","1,834.56",52.50,34.94,EUR
Total: Campaigns,--,--,--,"17,134","1,152","1,834.56",52.50,34.94,EUR
`;

// The same report from a French UI, re-saved by Excel (semicolons).
const FRENCH_CSV = `Rapport sur les campagnes
1 septembre 2026 - 30 septembre 2026
Campagne;Type de campagne;Coût;Conversions;Coût/conv.
CPA - Santé - Fiches;Search;1 234,56;40,5;30,48
CPA - Auto - Appels;Search;600;12;50
Total : campagnes;--;1 834,56;52,5;34,94
`;

describe("parseDelimitedText", () => {
  it("reads an English Google Ads export and skips its total rows", () => {
    const parsed = parseDelimitedText(ENGLISH_CSV, "export.csv");

    expect(parsed.period).toEqual({ text: "September 1, 2026 - September 30, 2026", from: "2026-09-01", to: "2026-09-30" });
    expect(parsed.rows).toEqual([
      { campaign: "CPA | Santé | Leads", account: "CPA Courtage", depenses: 1234.56, conversions: 40.5 },
      { campaign: "CPA | Auto | Appels", account: "CPA Courtage", depenses: 600, conversions: 12 },
      { campaign: "ALM | Santé | Appels", account: "ALM Assurances", depenses: 0, conversions: 0 },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it("is not fooled by '|' in campaign names when finding the delimiter", () => {
    // Papa Parse's own guess picks "|" on this file.
    const csv = `Campaign report
"September 1, 2026 - September 30, 2026"
Campaign status,Campaign,Account,Campaign type,Impr.,Clicks,Cost,Conversions,Cost / conv.,Currency code
Enabled,CPA | Santé | Leads,CPA Courtage,Search,"52,034","2,842","8,234.56",412.50,19.96,EUR
Enabled,CPA | Santé | Leads | PMax,CPA Courtage,Performance Max,"120,400","3,100","2,310.10",101.00,22.87,EUR
Enabled,CPA | Santé | Appels,CPA Courtage,Search,"15,000",900,"3,120.00",96.00,32.50,EUR
Enabled,CPA | Auto | Appels,CPA Courtage,Search,"22,000","1,400","2,760.40",88.33,31.25,EUR
Paused,CPA | Marque,CPA Courtage,Search,"4,000",600,145.20,12.00,12.10,EUR
Enabled,ALM | Santé | Fiches,ALM Assurances,Search,"40,100","2,200","6,420.75",351.00,18.29,EUR
Enabled,ALM | Santé | Appels,ALM Assurances,Search,"9,800",640,"1,980.00",61.00,32.46,EUR
Enabled,ALM | Auto | Appels,ALM Assurances,Search,"18,700","1,150","2,415.90",70.50,34.27,EUR
Total: Account,--,--,--,--,--,"27,386.91","1,192.33",22.97,EUR
Total: Campaigns,--,--,--,--,--,"27,386.91","1,192.33",22.97,EUR
`;

    const parsed = parseDelimitedText(csv, "export.csv");

    expect(parsed.rows).toHaveLength(8);
    expect(parsed.rows[1]).toEqual({
      campaign: "CPA | Santé | Leads | PMax",
      account: "CPA Courtage",
      depenses: 2310.1,
      conversions: 101,
    });
    expect(parsed.rows.reduce((sum, row) => sum + row.depenses, 0)).toBeCloseTo(27386.91, 2);
  });

  it("reads a French export with semicolons and decimal commas", () => {
    const parsed = parseDelimitedText(FRENCH_CSV, "export.csv");

    expect(parsed.period?.from).toBe("2026-09-01");
    expect(parsed.rows).toEqual([
      { campaign: "CPA - Santé - Fiches", account: null, depenses: 1234.56, conversions: 40.5 },
      { campaign: "CPA - Auto - Appels", account: null, depenses: 600, conversions: 12 },
    ]);
  });

  it("reads the tab-separated UTF-16 'Excel .csv' export", () => {
    const tsv = "Campaign report\r\nCampaign\tCost\tConversions\r\nCPA Auto Appels\t10.5\t1\r\n";
    const bytes = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...tsv].map((c) => c.charCodeAt(0))).buffer)]);

    const parsed = parseDelimitedText(decodeText(bytes), "export.csv");

    expect(parsed.rows).toEqual([{ campaign: "CPA Auto Appels", account: null, depenses: 10.5, conversions: 1 }]);
  });

  it("reports unreadable amounts instead of guessing", () => {
    const parsed = parseDelimitedText("Campaign,Cost,Conversions\nCPA Auto Appels,abc,1\n", "export.csv");

    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings[0]).toContain("CPA Auto Appels");
  });

  it("rejects files without the required columns", () => {
    expect(() => parseDelimitedText("Keyword,Cost\nfoo,1\n", "x.csv")).toThrow(ExportFormatError);
    expect(() => parseDelimitedText("Campaign,Cost\nfoo,1\n", "x.csv")).toThrow(/Conversions/);
  });
});

describe("toNumber", () => {
  it.each([
    ["1,234.56", ".", 1234.56],
    ["1 234,56 €", ",", 1234.56],
    ["EUR 12.00", ".", 12],
    ["1.234,56", ",", 1234.56],
    ["0,5", ",", 0.5],
    ["--", ".", 0],
    ["", ".", 0],
    [42, ".", 42],
  ] as const)("%s (%s) -> %s", (value, separator, expected) => {
    expect(toNumber(value, separator)).toBe(expected);
  });

  it("returns NaN for text", () => {
    expect(toNumber("n/a", ".")).toBeNaN();
  });
});

describe("decodeText", () => {
  it("falls back to Windows-1252 for CSV files saved by Excel", () => {
    expect(decodeText(new Uint8Array([0x53, 0x61, 0x6e, 0x74, 0xe9]))).toBe("Santé");
  });
});
