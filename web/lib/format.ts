const LOCALE = "fr-FR";

const amount = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });
const count = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });

/** For columns whose header already says "(€)". */
export const formatAmount = (value: number) => amount.format(value);

/** A cost per conversion; null (no conversion) shows as a dash. */
export const formatCost = (value: number | null, { withSymbol = false } = {}) =>
  value === null ? "—" : withSymbol ? currency.format(value) : amount.format(value);

/** Conversions can be fractional with data-driven attribution. */
export const formatCount = (value: number) => count.format(value);

export const formatDate = (date: Date) => day.format(date);

/** "2026-09-30" -> "30/09/2026", without going through time zones. */
export const formatIsoDate = (isoDate: string) => isoDate.split("-").reverse().join("/");
