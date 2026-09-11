import type { CinemaVenue } from "./types";

/**
 * Source of the Gebze Center AVM programme. The mall's page (gebzecenter.com.tr/sinema-seanslari/) only links to the
 * operator, so the operator's public branch page is read: Paribu Cineverse Gebze Center (robots.txt allows it; only
 * /biletleme/ is disallowed and never requested). Pure constants, safe everywhere.
 */
export const CINEMA_SOURCE = "cineverse";
export const CINEVERSE_ORIGIN = "https://www.paribucineverse.com";
/** Programme of one day: ?tarih=DD-MM-YYYY (the date picker lists the published days, 3 at a time). */
export const CINEVERSE_BRANCH_PATH = "/sinemalar/gebze-center";
/** "Vizyona girecek filmler" (chain-wide; ld+json ItemList of Movie with datePublished). */
export const CINEVERSE_UPCOMING_PATH = "/gelecek-filmler";

/** Data-cache tag of every cinema read (expired by the import route). */
export const CINEMA_CACHE_TAG = "cinema";
export const CINEMA_REVALIDATE_SECONDS = 1800;

/** Used until app_settings 'cinema_source' is readable (same values as the migration seed). */
export const DEFAULT_CINEMA_VENUE: CinemaVenue = {
  enabled: true,
  venue: "Gebze Center AVM",
  cinema: "Paribu Cineverse Gebze Center",
  operator: "Paribu Cineverse",
  url: `${CINEVERSE_ORIGIN}${CINEVERSE_BRANCH_PATH}`,
  placeSlug: "gebze-center-avm",
  lat: 40.7954655,
  lng: 29.4420625,
};

/** Branch page (programme + tickets) of one cinema day 'YYYY-MM-DD' (?tarih=DD-MM-YYYY on the source). */
export function branchDayUrl(venueUrl: string, dayKey?: string | null): string {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return venueUrl;
  const [y, m, d] = dayKey.split("-");
  return `${venueUrl}${venueUrl.includes("?") ? "&" : "?"}tarih=${d}-${m}-${y}`;
}
