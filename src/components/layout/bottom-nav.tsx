"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "@/core/routes";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { MAIN_TABS, isBottomNavHiddenRoute, type MainTab } from "./nav-config";
import { useBottomNavHidden } from "./nav-visibility";

/** Length of the longest route prefix of `tab` that matches (0 = no match), so "/profil/bildirimler" beats "/profil". */
function matchScore(pathname: string, tab: MainTab): number {
  return tab.match.reduce((best, m) => (isRouteActive(pathname, m) ? Math.max(best, m.length) : best), 0);
}

/**
 * Flat black tab bar on the bottom edge (Anasayfa, Keşfet, Arama, Bildirim, Profil): the same bg-neutral-950 in both
 * themes, full width at every screen size (no rounded corners, no side gaps, no border or shadow); the tabs stay
 * centred up to the app column width. Icon above label, the active tab white and bold. Always visible while scrolling
 * (hidden only on full-screen flows); safe areas are padded inside the bar. Bar height matches --bottomnav-h.
 */
export function BottomNav() {
  const pathname = usePathname();
  const forcedHidden = useBottomNavHidden();
  const { count } = useUnreadNotifications();
  const routeHidden = isBottomNavHiddenRoute(pathname);
  if (forcedHidden || routeHidden) return null;

  const scores = MAIN_TABS.map((t) => matchScore(pathname, t));
  const top = Math.max(...scores);
  const activeIndex = top > 0 ? scores.indexOf(top) : -1;

  return (
    <>
      <div aria-hidden className="h-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px))] shrink-0" />
      <nav
        aria-label="Ana menü"
        className="fixed inset-x-0 bottom-0 z-40 bg-neutral-950 pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]"
      >
        <ul className="mx-auto grid w-full max-w-2xl grid-cols-5 px-1 pt-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)]">
          {MAIN_TABS.map((tab, i) => {
            const active = i === activeIndex;
            const Icon = tab.icon;
            const showDot = tab.label === "Bildirim" && count > 0;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={showDot ? `${tab.label}, ${count} okunmamış` : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-white/40",
                    active ? "text-white" : "text-white/55 hover:text-white/85",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-[26px] shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden />
                    {/* The ring is the bar colour, so the dot reads as cut out of the icon. */}
                    {showDot ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-neutral-950" aria-hidden /> : null}
                  </span>
                  <span className={cn("max-w-full truncate text-[11px] leading-none", active ? "font-bold" : "font-semibold")}>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
