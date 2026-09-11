import { Bell, Compass, Home, Search, UserRound, type LucideIcon } from "lucide-react";
import { isRouteActive, routes } from "@/core/routes";

export type MainTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Route prefixes that mark this tab as active. */
  match: string[];
};

/** Bottom nav: Anasayfa, Keşfet (city map), Arama, Bildirim, Profil. The most specific match wins. */
export const MAIN_TABS: MainTab[] = [
  { href: routes.home(), label: "Anasayfa", icon: Home, match: ["/"] },
  {
    href: routes.nearby.root(),
    label: "Keşfet",
    icon: Compass,
    match: ["/yakinimda", "/nobetci-eczane", "/eczane", "/cami", "/durak", "/gezilecek-yerler", "/rehber", "/kurum"],
  },
  { href: routes.search(), label: "Arama", icon: Search, match: ["/ara"] },
  { href: routes.profile.notifications(), label: "Bildirim", icon: Bell, match: ["/profil/bildirimler"] },
  { href: routes.profile.root(), label: "Profil", icon: UserRound, match: ["/profil", "/isletme"] },
];

/** Route prefixes where the bottom nav is hidden automatically (full-screen flows). Matches the route and its sub-paths. */
export const BOTTOM_NAV_HIDDEN_PREFIXES = ["/ilan-ver", "/hizmet-talebi", "/isletme/basvuru", "/profil/telefon-degistir", "/gebzemai"];

/**
 * Detail pages that always hide the nav (DetailHero, ListingHeroBar, PageHeader hideBottomNav, the QR menu's
 * HideBottomNav). Only sub-paths match (trailing slash), so the lists /firmalar, /etkinlikler, /ilanlar, /is-ilanlari
 * and /gezilecek-yerler keep the nav. Deciding it during render means neither the loading skeleton nor the page paints
 * a frame with the nav (HideBottomNav only hides it after the first paint).
 */
export const BOTTOM_NAV_HIDDEN_DETAIL_PREFIXES = ["/firma/", "/etkinlik/", "/ilan/", "/is-ilani/", "/eczane/", "/cami/", "/durak/", "/gezilecek-yerler/", "/menu/", "/kurum/"];

/** True when the route itself hides the bottom nav (no HideBottomNav needed). */
export function isBottomNavHiddenRoute(pathname: string): boolean {
  return BOTTOM_NAV_HIDDEN_PREFIXES.some((p) => isRouteActive(pathname, p)) || BOTTOM_NAV_HIDDEN_DETAIL_PREFIXES.some((p) => pathname.startsWith(p));
}
