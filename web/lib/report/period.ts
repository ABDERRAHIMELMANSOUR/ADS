import { normalize } from "./rules";

/** The date range Google Ads writes above the header of an export. */
export type Period = {
  /** The line as written in the file. */
  text: string;
  /** ISO dates, when the line could be read (French or English month names). */
  from: string | null;
  to: string | null;
};

// Prefixes of month names after normalize(), in French and English.
const MONTHS: [RegExp, number][] = [
  [/^jan/, 1],
  [/^(fev|feb)/, 2],
  [/^mar/, 3],
  [/^(avr|apr)/, 4],
  [/^(mai|may)/, 5],
  [/^(juin|jun)/, 6],
  [/^(juil|jul)/, 7],
  [/^(aou|aug)/, 8],
  [/^sep/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^dec/, 12],
];

const monthOf = (token = "") => MONTHS.find(([pattern]) => pattern.test(token))?.[1] ?? null;
const dayOf = (token = "") => (/^\d{1,2}(er)?$/.test(token) ? Number.parseInt(token, 10) : null);
const yearOf = (token = "") => (/^\d{4}$/.test(token) ? Number(token) : null);

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Reads "September 1, 2026 - September 30, 2026" or
 * "1 sept. 2026 - 30 sept. 2026" into ISO dates.
 */
export function parsePeriod(text: string): Period {
  const tokens = normalize(text).split(" ");
  const dates: string[] = [];
  for (let i = 0; i + 2 < tokens.length; i++) {
    const [a, b, c] = tokens.slice(i, i + 3);
    const year = yearOf(c);
    if (year === null) continue;
    // English "September 1 2026", then French "1 septembre 2026".
    const [month, day] = monthOf(a) && dayOf(b) ? [monthOf(a), dayOf(b)] : [monthOf(b), dayOf(a)];
    if (month && day) {
      dates.push(iso(year, month, day));
      i += 2;
    }
  }
  return dates.length === 2 ? { text, from: dates[0], to: dates[1] } : { text, from: null, to: null };
}
