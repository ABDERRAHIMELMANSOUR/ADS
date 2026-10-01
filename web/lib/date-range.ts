/** Inclusive range of ISO dates (YYYY-MM-DD), as stored in Supabase. */
export type DateRange = { from: string; to: string };

export type Preset = { id: string; label: string; range: () => DateRange };

// "Today" for the presets. Ad platforms report days in the ad account time zone.
const TIME_ZONE = "Europe/Paris";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(isoDate: string, monthOffset = 0): string {
  const date = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + monthOffset);
  return date.toISOString().slice(0, 10);
}

/** Complete days only: the pipeline loads data up to yesterday. */
function lastDays(count: number): DateRange {
  const yesterday = addDays(today(), -1);
  return { from: addDays(yesterday, -(count - 1)), to: yesterday };
}

export const PRESETS: Preset[] = [
  { id: "7j", label: "7 derniers jours", range: () => lastDays(7) },
  { id: "30j", label: "30 derniers jours", range: () => lastDays(30) },
  {
    id: "mois",
    label: "Mois en cours",
    range: () => ({ from: firstOfMonth(today()), to: today() }),
  },
  {
    id: "mois-precedent",
    label: "Mois précédent",
    range: () => ({
      from: firstOfMonth(today(), -1),
      to: addDays(firstOfMonth(today()), -1),
    }),
  },
];

const DEFAULT_PRESET = "30j";

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE.test(value) &&
    // Rejects impossible dates such as 2026-02-31.
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().startsWith(value)
  );
}

/**
 * Reads the range from the URL: ?from=YYYY-MM-DD&to=YYYY-MM-DD, or
 * ?preset=<id>. Anything invalid falls back to the default preset.
 */
export function resolveDateRange(
  searchParams: Record<string, string | string[] | undefined>,
): DateRange {
  const { from, to, preset } = searchParams;
  if (isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { from, to };
  }
  const selected =
    PRESETS.find((candidate) => candidate.id === preset) ??
    PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET)!;
  return selected.range();
}

export function isSameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}
