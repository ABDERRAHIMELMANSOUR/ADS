import Papa from "papaparse";

import { type Period, parsePeriod } from "./period";
import { normalize } from "./rules";

/** One campaign line of a Google Ads export. */
export type CampaignRow = {
  campaign: string;
  /** Account name, when the export comes from a manager account. */
  account: string | null;
  depenses: number;
  conversions: number;
};

export type ParsedExport = {
  fileName: string;
  /** Date range line written above the header by Google Ads. */
  period: Period | null;
  rows: CampaignRow[];
  warnings: string[];
};

type Cell = string | number | null;

/** A problem with the file itself, shown to the user as is. */
export class ExportFormatError extends Error {}

// Header names in English and French Google Ads exports, after normalize().
const CAMPAIGN_HEADERS = ["campaign", "campaign name", "campagne", "nom de la campagne", "nom de campagne"];
const ACCOUNT_HEADERS = ["account", "account name", "customer name", "compte", "nom du compte", "nom du client"];
const CONVERSION_HEADERS = ["conversions", "conv"];
// "Cost", "Coût", "Coût (EUR)"... but not "Cost / conv." or "Avg. cost".
const COST_HEADER = /^(cost|cout|depenses|spend)( [a-z]{3})?$/;

const HEADER_SEARCH_ROWS = 30;
const HEADER_NOT_FOUND =
  "Colonnes « Campagne » et « Coût » introuvables. Exportez le rapport Campagnes de Google Ads.";

export async function parseExportFile(file: File): Promise<ParsedExport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isZip(bytes)) {
    // Loaded on demand: only needed for .xlsx files.
    const { readSheet } = await import("read-excel-file/browser");
    const sheet = await readSheet(file);
    return parseExportTable(
      sheet.map((row) => row.map(toCell)),
      file.name,
    );
  }
  if (isLegacyExcel(bytes)) {
    throw new ExportFormatError(
      "Format .xls non pris en charge : exportez le rapport en .xlsx ou en .csv depuis Google Ads.",
    );
  }
  return parseDelimitedText(decodeText(bytes), file.name);
}

// Tab (Google Ads "Excel .csv" / .tsv), ";" (CSV re-saved by a French Excel)
// or "," (Google Ads .csv).
const DELIMITERS = ["\t", ";", ","];

export function parseDelimitedText(text: string, fileName: string): ParsedExport {
  // Papa Parse's own delimiter guess is fooled by "|" in campaign names
  // ("CPA | Santé | Leads"), so keep the delimiter that splits a row into
  // known Google Ads columns.
  for (const delimiter of DELIMITERS) {
    const table = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy" }).data;
    if (findHeaderIndex(table) >= 0) return parseExportTable(table, fileName);
  }
  throw new ExportFormatError(HEADER_NOT_FOUND);
}

/**
 * Decodes CSV bytes. Google Ads ".csv" is UTF-8, its "Excel .csv" is UTF-16
 * with a byte order mark, and Excel re-saves CSV files as Windows-1252.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Finds the header row and reads the campaign lines below it. */
export function parseExportTable(table: Cell[][], fileName: string): ParsedExport {
  const headerIndex = findHeaderIndex(table);
  if (headerIndex < 0) throw new ExportFormatError(HEADER_NOT_FOUND);

  const columns = findColumns(table[headerIndex]);
  if (columns.conversions < 0) {
    throw new ExportFormatError(
      "Colonne « Conversions » introuvable. Ajoutez-la au rapport Campagnes avant l'export.",
    );
  }

  const body = table.slice(headerIndex + 1);
  const decimalSeparator = detectDecimalSeparator(body, [columns.cost, columns.conversions]);
  const rows: CampaignRow[] = [];
  const unreadable: string[] = [];

  for (const row of body) {
    const campaign = cellText(row[columns.campaign]);
    if (!campaign || campaign === "--" || isTotalRow(row)) continue;

    const depenses = toNumber(row[columns.cost], decimalSeparator);
    const conversions = toNumber(row[columns.conversions], decimalSeparator);
    if (Number.isNaN(depenses) || Number.isNaN(conversions)) {
      unreadable.push(campaign);
      continue;
    }
    rows.push({
      campaign,
      account: columns.account >= 0 ? cellText(row[columns.account]) || null : null,
      depenses,
      conversions,
    });
  }

  const warnings = unreadable.length
    ? [`${unreadable.length} ligne(s) ignorée(s), montants illisibles : ${unreadable.slice(0, 3).join(", ")}`]
    : [];
  return { fileName, period: findPeriod(table.slice(0, headerIndex)), rows, warnings };
}

/** The header is the first row naming both a campaign and a cost column. */
function findHeaderIndex(table: Cell[][]): number {
  return table.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => {
    const columns = findColumns(row);
    return columns.campaign >= 0 && columns.cost >= 0;
  });
}

function findColumns(row: Cell[]) {
  const headers = row.map((cell) => normalize(cellText(cell)));
  return {
    campaign: headers.findIndex((h) => CAMPAIGN_HEADERS.includes(h)),
    account: headers.findIndex((h) => ACCOUNT_HEADERS.includes(h)),
    cost: headers.findIndex((h) => COST_HEADER.test(h)),
    conversions: headers.findIndex((h) => CONVERSION_HEADERS.includes(h)),
  };
}

/** Google Ads appends "Total: Campaigns", "Total : compte"... rows. */
function isTotalRow(row: Cell[]): boolean {
  return row.some((cell) => /^total\s*:/i.test(cellText(cell)));
}

/** The "September 1, 2026 - September 30, 2026" line above the header. */
function findPeriod(preamble: Cell[][]): Period | null {
  for (const row of preamble) {
    for (const cell of row) {
      const text = cellText(cell);
      if (/\d{4}/.test(text) && /\s[-–]\s/.test(text)) return parsePeriod(text);
    }
  }
  return null;
}

/** "1 234,56" (French) or "1,234.56" (English): decided per file. */
function detectDecimalSeparator(rows: Cell[][], columns: number[]): "," | "." {
  let comma = 0;
  let dot = 0;
  for (const row of rows) {
    for (const column of columns) {
      const value = row[column];
      if (typeof value !== "string") continue;
      const digits = value.replace(/[^\d,.]/g, "");
      if (/,\d{1,2}$/.test(digits)) comma++;
      else if (/\.\d{1,2}$/.test(digits)) dot++;
    }
  }
  return comma > dot ? "," : ".";
}

/** Parses a cell into a number. Empty and "--" mean 0; NaN means unreadable. */
export function toNumber(value: Cell | undefined, decimalSeparator: "," | "."): number {
  if (typeof value === "number") return value;
  // Drops spaces (including non-breaking ones) and a currency symbol or code.
  let text = cellText(value)
    .replace(/[\s  ]/g, "")
    .replace(/^(?:[€$£]|[A-Z]{3})|(?:[€$£]|[A-Z]{3})$/g, "");
  if (text === "" || /^-+$/.test(text)) return 0;
  if (!/^-?[\d.,]+$/.test(text)) return Number.NaN;
  text = decimalSeparator === "," ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

function cellText(cell: Cell | undefined): string {
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const isLegacyExcel = (bytes: Uint8Array) =>
  bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
