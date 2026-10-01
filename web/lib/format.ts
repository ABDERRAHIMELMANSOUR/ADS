// Spend is stored in the ad accounts' currency; both accounts are assumed to use it.
const CURRENCY = "EUR";
const LOCALE = "fr-FR";

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
const count = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timestamp = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export const formatCurrency = (value: number) => currency.format(value);

/** Conversions can be fractional (data-driven attribution in Google Ads). */
export const formatCount = (value: number) => count.format(value);

export const formatCostPerConversion = (value: number | null) =>
  value === null ? "—" : currency.format(value);

export const formatDay = (isoDate: string) => day.format(new Date(`${isoDate}T00:00:00Z`));

export const formatTimestamp = (date: Date) => timestamp.format(date);
