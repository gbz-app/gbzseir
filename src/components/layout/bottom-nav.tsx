"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "@/core/routes";
import { BOTTOM_NAV_HIDDEN_PREFIXES, MAIN_TABS } from "./nav-config";
import { useBottomNavHidden } from "./nav-visibility";

/**
 * Floating dark tab bar (5 tabs, icon above label for every tab), 20 px above the bottom edge. The active tab has a
 * filled icon and a bold white label; the others are muted outline icons. Always visible while scrolling (hidden
 * only on full-screen flows); respects the safe area. Total height (bar + bottom gap) matches --bottomnav-h.
 */
export function BottomNav() {
  const pathname = usePathname();
  const forcedHidden = useBottomNavHidden();
  const routeHidden = BOTTOM_NAV_HIDDEN_PREFIXES.some((p) => isRouteActive(pathname, p));
  if (forcedHidden || routeHidden) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px))] shrink-0" />
      <nav
        aria-label="Ana menü"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl px-3 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
      >
        <ul className="pointer-events-auto grid grid-cols-5 rounded-[1.75rem] bg-neutral-950 p-1 shadow-float ring-1 ring-white/10 dark:bg-neutral-900">
          {MAIN_TABS.map((tab) => {
            const active = tab.match.some((m) => isRouteActive(pathname, m));
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-3xl px-1 py-1.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-white/40",
                    active ? "text-white" : "text-white/50 hover:text-white/80",
                  )}
                >
                  <Icon
                    className="size-6 shrink-0"
                    strokeWidth={active ? 2 : 1.6}
                    fill={active ? "currentColor" : "none"}
                    fillOpacity={active ? 0.22 : 0}
                    aria-hidden
                  />
                  <span className={cn("max-w-full truncate text-[11px] leading-none", active ? "font-semibold" : "font-medium")}>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
