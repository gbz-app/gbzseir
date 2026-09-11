import { trCapitalize } from "@/core/tr";

/**
 * Popular searches shown while nothing is typed. The live list comes from rpc popular_searches (logged terms, then the
 * admin list app_settings.popular_searches); this is the fallback when neither can be read. Same as the migration seed.
 */
export const DEFAULT_POPULAR_SEARCHES: readonly string[] = [
  "Nöbetçi eczane",
  "Döner",
  "Kuaför",
  "Tesisatçı",
  "Kafe",
  "Otel",
  "Taksi",
  "Halı saha",
  "Kahvaltı",
  "Oto yıkama",
];

/** Logged terms are stored in lower case: "halı saha" -> "Halı saha". */
export function displayTerm(term: string): string {
  return trCapitalize(term.trim());
}
