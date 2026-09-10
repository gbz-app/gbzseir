import { Home, MapPin, Tag, Wrench, UserRound, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";

export type MainTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Route prefixes that mark this tab as active. */
  match: string[];
};

export const MAIN_TABS: MainTab[] = [
  { href: routes.home(), label: "Ana Sayfa", icon: Home, match: ["/"] },
  {
    href: routes.nearby.root(),
    label: "Yakınımda",
    icon: MapPin,
    match: ["/yakinimda", "/nobetci-eczane", "/eczane", "/cami", "/durak", "/gezilecek-yerler"],
  },
  { href: routes.listings.root(), label: "İlanlar", icon: Tag, match: ["/ilanlar", "/ilan", "/is-ilani", "/ilan-ver"] },
  {
    href: routes.services.root(),
    label: "Hizmetler",
    icon: Wrench,
    match: ["/hizmetler", "/hizmet-talebi", "/talep", "/firmalar", "/firma"],
  },
  { href: routes.profile.root(), label: "Profil", icon: UserRound, match: ["/profil", "/isletme"] },
];

/** Paths where the TopBar is shown. Other pages render <PageHeader/> (the profile page has its own header). */
export const TOPBAR_PATHS = ["/", "/yakinimda", "/ilanlar", "/hizmetler"];

/** Route prefixes where the bottom nav is hidden automatically (full-screen flows). */
export const BOTTOM_NAV_HIDDEN_PREFIXES = ["/ilan-ver", "/hizmet-talebi", "/isletme/basvuru", "/profil/telefon-degistir"];
