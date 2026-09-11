/**
 * Global app/brand configuration.
 * The brand name lives ONLY here (APP_NAME) so the product can be renamed in one place.
 */

export const APP_NAME = "Gebzem";
export const APP_FULL_NAME = `${APP_NAME} - Kocaeli Şehir Rehberi`;
export const APP_TAGLINE = "Kocaeli artık cebinde";
export const APP_DESCRIPTION =
  "Nöbetçi eczane, yakındaki cami ve duraklar, 2. el ve iş ilanları, usta ve hizmet talepleri, Kocaeli'nin onaylı işletmeleri: 12 ilçede şehirle ilgili her şey tek uygulamada.";

/**
 * The brand's home city. The app covers every Kocaeli district (src/config/districts.ts); `center` is the fallback map
 * point when the user has chosen no district and shared no location.
 */
export const CITY = {
  name: "Gebze",
  slug: "gebze",
  province: "Kocaeli",
  center: { lat: 40.8027, lng: 29.4307 },
  timezone: "Europe/Istanbul",
} as const;

/** Public site URL without trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://gbzsehir.vercel.app").replace(/\/+$/, "");

/** Brand colors used outside CSS (manifest, viewport theme-color, icons). */
export const BRAND_COLORS = {
  primary: "#8C6CF0",
  primaryDark: "#6D4FD8",
  accent: "#F59E0B",
  backgroundLight: "#EFE8FB",
  backgroundDark: "#15121F",
} as const;

/**
 * Cloudflare Turnstile site key for the login form. Unset = no widget and no captchaToken.
 * (OTP demo mode is app_settings.otp_demo_mode, read on the server: one DB switch.)
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

/** Feature switches (turn on when the feature is ready to launch). */
export const FEATURES = {
  /** New business applications (existing businesses keep their panel). Paused for now. */
  businessApplications: false,
} as const;

/** localStorage keys used across the app (all access must be wrapped in try/catch). */
export const STORAGE_KEYS = {
  onboarded: "gebzem.onboarded.v1",
  theme: "gebzem.theme",
  visits: "gebzem.visits",
  installDismissedAt: "gebzem.install.dismissedAt",
  location: "gebzem.location.v1",
  /** Chosen district + location mode: { district: DistrictSlug | null, mode }. */
  district: "gebzem.district.v1",
  /** @deprecated Old neighbourhood choice; read once to migrate it to `district`, dropped in phase C. */
  neighbourhood: "gebzem.neighbourhood.v1",
  marketingConsent: "gebzem.marketingConsent",
  wizardDraftPrefix: "gebzem.draft.",
} as const;

/** Media bucket (public) used by ImageUploader. */
export const MEDIA_BUCKET = "media";
