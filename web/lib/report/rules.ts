/**
 * Business rules: how a Google Ads campaign maps to the report dimensions.
 *
 * This file is the single source of truth for categorization. Adapt the
 * patterns to your naming conventions here. Patterns are matched against
 * normalize(text): lowercase, no accents, every run of punctuation or
 * spaces turned into a single space.
 *   "CPA_Santé-Mutuelle | Appels" -> "cpa sante mutuelle appels"
 */

// Report order, as in the reference Excel report.
export const COMPTES = ["CPA", "ALM"] as const;
export const SERVICES = ["Santé", "Auto"] as const;
export const TYPES = ["Fiches / Leads", "Appels"] as const;

export type Compte = (typeof COMPTES)[number];
export type Service = (typeof SERVICES)[number];
export type TypeConversion = (typeof TYPES)[number];

/**
 * Compte: matched against the account name column when the export has one
 * (manager account exports), otherwise against the campaign name, then the
 * file name. Word boundaries keep "tCPA" (a bidding strategy) out.
 */
const COMPTE_PATTERNS: Record<Compte, RegExp> = {
  CPA: /\bcpa\b/,
  ALM: /\balm\b/,
};

/** Service: matched against the campaign name. */
const SERVICE_PATTERNS: Record<Service, RegExp> = {
  Santé: /sante|mutuelle/,
  Auto: /auto|voiture|vehicule/,
};

/**
 * Type: matched against the campaign name. The whole campaign (spend and
 * conversions) goes to its type. Word boundaries keep "rappel" (a callback
 * request form) out of "Appels".
 */
const TYPE_PATTERNS: Record<TypeConversion, RegExp> = {
  "Fiches / Leads": /\b(fiches?|leads?|formulaires?)\b/,
  Appels: /\b(appels?|calls?)\b/,
};

export function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The single key whose pattern matches, or null when none or several match. */
function matchOne<K extends string>(patterns: Record<K, RegExp>, text: string): K | null {
  const normalized = normalize(text);
  const matches = (Object.keys(patterns) as K[]).filter((key) => patterns[key].test(normalized));
  return matches.length === 1 ? matches[0] : null;
}

export function classifyCompte(...candidates: (string | null | undefined)[]): Compte | null {
  for (const candidate of candidates) {
    const compte = candidate ? matchOne(COMPTE_PATTERNS, candidate) : null;
    if (compte) return compte;
  }
  return null;
}

export const classifyService = (campaign: string) => matchOne(SERVICE_PATTERNS, campaign);

export const classifyType = (campaign: string) => matchOne(TYPE_PATTERNS, campaign);
