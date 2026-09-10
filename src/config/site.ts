/**
 * Global app/brand configuration.
 * The brand name lives ONLY here (APP_NAME) so the product can be renamed in one place.
 */

export const APP_NAME = "Gebzem";
export const APP_FULL_NAME = `${APP_NAME} - Gebze Şehir Rehberi`;
export const APP_TAGLINE = "Gebze artık cebinde";
export const APP_DESCRIPTION =
  "Nöbetçi eczane, yakındaki cami ve duraklar, 2. el ve iş ilanları, usta ve hizmet talepleri, Gebze'nin onaylı işletmeleri: şehirle ilgili her şey tek uygulamada.";

export const CITY = {
  name: "Gebze",
  slug: "gebze",
  province: "Kocaeli",
  center: { lat: 40.8027, lng: 29.4307 },
  timezone: "Europe/Istanbul",
} as const;

/** Public site URL without trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://gbzsehir.vercel.app").replace(/\/+$/, "");

/** Placeholder support contacts (replace before launch). */
export const SUPPORT = {
  phone: "+908500000000",
  phoneDisplay: "0850 000 00 00",
  email: "destek@gebzem.app",
} as const;

/** Brand colors used outside CSS (manifest, viewport theme-color, icons). */
export const BRAND_COLORS = {
  primary: "#0F766E",
  primaryDark: "#115E59",
  accent: "#F59E0B",
  backgroundLight: "#F7FAF9",
  backgroundDark: "#0B1413",
} as const;

/** Prototype flags. */
export const OTP_DEMO_MODE = process.env.NEXT_PUBLIC_OTP_DEMO_MODE === "true";

/** localStorage keys used across the app (all access must be wrapped in try/catch). */
export const STORAGE_KEYS = {
  onboarded: "gebzem.onboarded.v1",
  theme: "gebzem.theme",
  visits: "gebzem.visits",
  installDismissedAt: "gebzem.install.dismissedAt",
  location: "gebzem.location.v1",
  neighbourhood: "gebzem.neighbourhood.v1",
  marketingConsent: "gebzem.marketingConsent",
  wizardDraftPrefix: "gebzem.draft.",
} as const;

/** Media bucket (public) used by ImageUploader. */
export const MEDIA_BUCKET = "media";
