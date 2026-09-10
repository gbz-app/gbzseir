/** Shapes returned by the admin analytics RPCs (admin_dashboard, admin_analytics, admin_online_now). */

export type StoreRow = {
  stat_date: string;
  downloads: number | null;
  active_installs: number | null;
  rating: number | null;
  ratings_count: number | null;
  reviews_count: number | null;
  note: string | null;
};

export type DashboardData = {
  generated_at: string;
  users: { total: number; today: number; week: number; business_owners: number; restricted: number; demo: number };
  businesses: { approved: number; pending: number; by_vertical: Record<string, number> };
  content: { listings_active: number; listings_pending: number; reports_open: number; support_new: number; events_upcoming: number; requests_open: number };
  live: { online_now: number; online_users: number };
  today: { sessions: number; visitors: number; signed_in: number; avg_duration_s: number };
  page_views_today: number;
  installs: { total: number; week: number; by_platform: Record<string, number>; store: Partial<Record<"google_play" | "app_store", StoreRow>> };
  series: Array<{ date: string; signups: number; sessions: number; page_views: number }>;
  top_pages: Array<{ path: string; views: number }>;
};

export type OnlineSession = {
  session: string;
  user_id: string | null;
  name: string | null;
  path: string | null;
  started_at: string;
  last_seen_at: string;
  page_views: number;
  device: string | null;
  os: string | null;
  standalone: boolean;
};

export type AnalyticsData = {
  days: number;
  totals: { sessions: number; visitors: number; signed_in: number; page_views: number; avg_duration_s: number; bounce_rate: number; standalone_share: number };
  series: Array<{ date: string; sessions: number; visitors: number; page_views: number; installs: number }>;
  top_pages: Array<{ path: string; views: number; avg_s: number }>;
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Array<{ host: string; sessions: number }>;
  installs: Record<string, number>;
  store: Array<StoreRow & { id: string; platform: "google_play" | "app_store" }>;
};

export const DEVICE_LABELS: Record<string, string> = { mobile: "Telefon", tablet: "Tablet", desktop: "Bilgisayar", bilinmiyor: "Bilinmiyor" };
export const INSTALL_LABELS: Record<string, string> = {
  pwa_android: "Android (PWA)",
  pwa_ios: "iPhone (ana ekran)",
  pwa_desktop: "Bilgisayar (PWA)",
  android: "Google Play",
  ios: "App Store",
};
export const STORE_LABELS: Record<string, string> = { google_play: "Google Play", app_store: "App Store" };

/** Readable label for an app path ("/firma/kule-kahve" -> "Firma: kule-kahve"). */
export function pathLabel(path: string | null | undefined): string {
  if (!path) return "-";
  if (path === "/") return "Ana sayfa";
  const [, first, ...rest] = path.split("/");
  const names: Record<string, string> = {
    firma: "Firma",
    kesfet: "Keşfet",
    etkinlik: "Etkinlik",
    etkinlikler: "Etkinlikler",
    ilan: "İlan",
    "is-ilani": "İş ilanı",
    ilanlar: "İlanlar",
    hizmetler: "Hizmetler",
    yakinimda: "Yakınımda",
    "nobetci-eczane": "Nöbetçi eczane",
    menu: "QR menü",
    profil: "Profil",
    isletme: "İşletme paneli",
    ara: "Arama",
    giris: "Giriş",
    yardim: "Yardım",
    haberler: "Haberler",
    "gezilecek-yerler": "Gezilecek yerler",
    firmalar: "Firmalar",
    "ilan-ver": "İlan ver",
  };
  const name = names[first ?? ""];
  if (!name) return path;
  return rest.length ? `${name}: ${decodeURIComponent(rest.join("/"))}` : name;
}
