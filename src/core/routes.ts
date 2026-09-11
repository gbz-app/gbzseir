/**
 * Single URL tree (pure TS). Web pages, SMS links, push payloads and the future Expo app use the same paths.
 * Never hand-write internal URLs in components; use these builders.
 */

import { IS_ADMIN_SITE } from "@/config/app-mode";

export type QueryValue = string | number | boolean | null | undefined;
export type QueryRecord = Record<string, QueryValue | QueryValue[]>;

/** Append query params, skipping empty values. withQuery('/ilanlar', {tab:'is-ilanlari'}) -> '/ilanlar?tab=is-ilanlari' */
export function withQuery(path: string, query?: QueryRecord | null): string {
  if (!query) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    const values = Array.isArray(v) ? v : [v];
    for (const x of values) {
      if (x === undefined || x === null || x === "" || x === false) continue;
      sp.append(k, String(x));
    }
  }
  const qs = sp.toString();
  if (!qs) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

/**
 * Sanitize a ?next= value: only same-origin relative paths are allowed (prevents open redirects),
 * and auth pages are never a "next" target (prevents loops). On the separate admin site every target is /admin/**.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  const fb = IS_ADMIN_SITE ? "/admin" : fallback;
  if (!next || typeof next !== "string") return fb;
  const n = next.trim();
  // Browsers drop tabs/newlines and treat "\" as "/" ("/\t/evil.example" -> "//evil.example"): reject them outright.
  if (/[\u0000-\u0020\\]/.test(n)) return fb;
  if (!n.startsWith("/") || n.startsWith("//")) return fb;
  // Final guard: the value must resolve to this origin.
  try {
    if (new URL(n, "http://same.invalid").host !== "same.invalid") return fb;
  } catch {
    return fb;
  }
  if (/^\/giris(?:[/?#]|$)/.test(n)) return fb;
  if (IS_ADMIN_SITE && !/^\/admin(?:[/?#]|$)/.test(n)) return fb;
  return n;
}

/** Is `pathname` the given route or nested under it? isRouteActive('/ilan/1', '/ilan') -> true */
export function isRouteActive(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

const enc = (v: string | number) => encodeURIComponent(String(v));

export type ListingsTab = "ikinci-el" | "is-ilanlari";
export type NearbyKind = "eczane" | "nobetci" | "cami" | "durak" | "taksi" | "gezilecek";

export const routes = {
  home: () => "/",
  search: (q?: string) => withQuery("/ara", { q }),
  offline: () => "/offline",

  auth: {
    /** /giris?next=... (login = signup) */
    login: (next?: string | null) => withQuery("/giris", { next }),
    /** /giris/dogrula?phone=+905...&next=... */
    verify: (phone: string, next?: string | null) => withQuery("/giris/dogrula", { phone, next }),
    /** /giris/profil?next=... (new users complete their profile) */
    profile: (next?: string | null) => withQuery("/giris/profil", { next }),
    /** Admin site: signed-in account without the admin role */
    noAdminAccess: () => "/giris/yetki",
  },

  nearby: {
    root: (tur?: NearbyKind) => withQuery("/yakinimda", { tur }),
    dutyPharmacies: () => "/nobetci-eczane",
    pharmacy: (id: string | number) => `/eczane/${enc(id)}`,
    mosque: (id: string | number) => `/cami/${enc(id)}`,
    stop: (id: string | number) => `/durak/${enc(id)}`,
    places: () => "/gezilecek-yerler",
    place: (slug: string) => `/gezilecek-yerler/${enc(slug)}`,
  },

  listings: {
    /** /ilanlar?tab=ikinci-el|is-ilanlari (+ optional filters) */
    root: (tab?: ListingsTab, query?: QueryRecord) => withQuery("/ilanlar", { tab, ...query }),
    classified: (id: string | number) => `/ilan/${enc(id)}`,
    job: (id: string | number) => `/is-ilani/${enc(id)}`,
    post: () => "/ilan-ver",
    postClassified: () => "/ilan-ver/ikinci-el",
    postJob: () => "/ilan-ver/is-ilani",
    postDone: (query?: { id?: string; tur?: "ikinci-el" | "is-ilani"; durum?: string }) => withQuery("/ilan-ver/tamam", query),
  },

  services: {
    root: () => "/hizmetler",
    category: (slug: string) => `/hizmetler/${enc(slug)}`,
    /** Wizard for a sub-category; `adim` is the 1-based step synced to ?adim=N */
    request: (subCategorySlug: string, adim?: number) => withQuery(`/hizmet-talebi/${enc(subCategorySlug)}`, { adim }),
    requestDone: (code?: string) => withQuery("/hizmet-talebi/tamam", { kod: code }),
    /** Customer's request page (accepted firms, close, review) */
    requestDetail: (code: string) => `/talep/${enc(code)}`,
  },

  businesses: {
    root: (query?: QueryRecord) => withQuery("/firmalar", query),
    detail: (slug: string) => `/firma/${enc(slug)}`,
    /** Vertical list: /kesfet/yemek | restoran | kafe | otel | hizmet | magaza */
    vertical: (tur: string, query?: QueryRecord) => withQuery(`/kesfet/${enc(tur)}`, query),
    /** Public digital menu (QR menü target) */
    menu: (slug: string) => `/menu/${enc(slug)}`,
  },

  events: {
    root: (query?: QueryRecord) => withQuery("/etkinlikler", query),
    detail: (slug: string) => `/etkinlik/${enc(slug)}`,
  },

  profile: {
    root: () => "/profil",
    edit: () => "/profil/duzenle",
    listings: () => "/profil/ilanlarim",
    jobs: () => "/profil/is-ilanlarim",
    requests: () => "/profil/taleplerim",
    favorites: () => "/profil/favoriler",
    notifications: () => "/profil/bildirimler",
    settings: () => "/profil/ayarlar",
    changePhone: () => "/profil/telefon-degistir",
    deleteAccount: () => "/profil/hesap-sil",
  },

  business: {
    /** Business panel home */
    root: () => "/isletme",
    intro: () => "/isletme/tanitim",
    apply: () => "/isletme/basvuru",
    /** Finish / fix a pending or rejected business of the user */
    applyEdit: (businessId: string) => `/isletme/basvuru?duzenle=${encodeURIComponent(businessId)}`,
    applyDone: () => "/isletme/basvuru/alindi",
    /** Switch the active business (route handler; use a plain <a>, not <Link>) and continue to `next` */
    select: (businessId: string, next?: string) => `/isletme/sec?b=${encodeURIComponent(businessId)}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
    edit: () => "/isletme/duzenle",
    photos: () => "/isletme/fotograflar",
    reviews: () => "/isletme/yorumlar",
    services: () => "/isletme/hizmetlerim",
    menu: () => "/isletme/menu",
    menuQr: () => "/isletme/menu/qr",
    rooms: () => "/isletme/odalar",
    events: () => "/isletme/etkinlikler",
    leads: () => "/isletme/talepler",
    lead: (id: string | number) => `/isletme/talepler/${enc(id)}`,
  },

  content: {
    news: () => "/haberler",
    announcements: () => "/duyurular",
    /** Acil durum numaraları */
    emergency: () => "/acil-durum",
    /** Destek merkezi; `konu` opens a form: sikayet | teknik_destek | reklam | isletme | oneri | diger */
    help: (konu?: string) => withQuery("/yardim", { konu }),
    sources: () => "/kaynaklar",
  },

  legal: {
    kvkk: () => "/yasal/kvkk",
    explicitConsent: () => "/yasal/acik-riza",
    privacy: () => "/yasal/gizlilik",
    terms: () => "/yasal/kosullar",
    cookies: () => "/yasal/cerez",
  },

  admin: {
    root: () => "/admin",
    analytics: (query?: QueryRecord) => withQuery("/admin/analitik", query),
    user: (id: string) => `/admin/kullanicilar/${enc(id)}`,
    support: (query?: QueryRecord) => withQuery("/admin/destek", query),
    finance: (query?: QueryRecord) => withQuery("/admin/muhasebe", query),
    events: () => "/admin/etkinlikler",
    listingCategories: () => "/admin/ilan-kategorileri",
    listings: () => "/admin/ilanlar",
    reports: () => "/admin/sikayetler",
    businesses: () => "/admin/isletmeler",
    serviceCategories: () => "/admin/hizmet-kategorileri",
    serviceCategory: (id: string | number) => `/admin/hizmet-kategorileri/${enc(id)}`,
    requests: () => "/admin/talepler",
    users: () => "/admin/kullanicilar",
    news: () => "/admin/haberler",
    announcements: () => "/admin/duyurular",
    places: () => "/admin/yerler",
    data: () => "/admin/veri",
    settings: () => "/admin/ayarlar",
  },
} as const;

/** Public, indexable static routes (used by sitemap.ts). */
export const PUBLIC_STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: "hourly" | "daily" | "weekly" | "monthly" | "yearly" }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/nobetci-eczane", priority: 0.9, changeFrequency: "hourly" },
  { path: "/yakinimda", priority: 0.7, changeFrequency: "weekly" },
  { path: "/gezilecek-yerler", priority: 0.7, changeFrequency: "weekly" },
  { path: "/ilanlar", priority: 0.8, changeFrequency: "hourly" },
  { path: "/hizmetler", priority: 0.8, changeFrequency: "weekly" },
  { path: "/firmalar", priority: 0.7, changeFrequency: "daily" },
  { path: "/kesfet/yemek", priority: 0.7, changeFrequency: "daily" },
  { path: "/kesfet/restoran", priority: 0.7, changeFrequency: "daily" },
  { path: "/kesfet/kafe", priority: 0.7, changeFrequency: "daily" },
  { path: "/kesfet/otel", priority: 0.7, changeFrequency: "daily" },
  { path: "/kesfet/hizmet", priority: 0.6, changeFrequency: "daily" },
  { path: "/etkinlikler", priority: 0.7, changeFrequency: "daily" },
  { path: "/haberler", priority: 0.6, changeFrequency: "hourly" },
  { path: "/duyurular", priority: 0.5, changeFrequency: "daily" },
  { path: "/yardim", priority: 0.3, changeFrequency: "monthly" },
  { path: "/kaynaklar", priority: 0.3, changeFrequency: "monthly" },
  { path: "/yasal/kvkk", priority: 0.2, changeFrequency: "yearly" },
  { path: "/yasal/acik-riza", priority: 0.2, changeFrequency: "yearly" },
  { path: "/yasal/gizlilik", priority: 0.2, changeFrequency: "yearly" },
  { path: "/yasal/kosullar", priority: 0.2, changeFrequency: "yearly" },
  { path: "/yasal/cerez", priority: 0.2, changeFrequency: "yearly" },
];
