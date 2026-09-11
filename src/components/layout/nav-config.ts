import { Bell, Compass, Home, Search, UserRound, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";

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
    match: ["/yakinimda", "/nobetci-eczane", "/eczane", "/cami", "/durak", "/gezilecek-yerler"],
  },
  { href: routes.search(), label: "Arama", icon: Search, match: ["/ara"] },
  { href: routes.profile.notifications(), label: "Bildirim", icon: Bell, match: ["/profil/bildirimler"] },
  { href: routes.profile.root(), label: "Profil", icon: UserRound, match: ["/profil", "/isletme"] },
];

/** Paths where the TopBar is shown. Other pages render <PageHeader/> (the profile page has its own header; Yakınımda is a full-screen map). */
export const TOPBAR_PATHS = ["/", "/ilanlar"];

/** Route prefixes where the bottom nav is hidden automatically (full-screen flows). */
export const BOTTOM_NAV_HIDDEN_PREFIXES = ["/ilan-ver", "/hizmet-talebi", "/isletme/basvuru", "/profil/telefon-degistir"];
