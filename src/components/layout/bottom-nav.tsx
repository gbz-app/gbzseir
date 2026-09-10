"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "@/core/routes";
import { BOTTOM_NAV_HIDDEN_PREFIXES, MAIN_TABS } from "./nav-config";
import { useBottomNavHidden, useHideOnScroll } from "./nav-visibility";

/**
 * Floating dark pill navigation (5 tabs): the active tab is a white pill with icon + label, the others are
 * round icon buttons. Hides on scroll-down and on full-screen flows; respects the safe area.
 */
export function BottomNav() {
  const pathname = usePathname();
  const forcedHidden = useBottomNavHidden();
  const scrollHidden = useHideOnScroll(pathname);
  const routeHidden = BOTTOM_NAV_HIDDEN_PREFIXES.some((p) => isRouteActive(pathname, p));
  if (forcedHidden || routeHidden) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px))] shrink-0" />
      <nav
        aria-label="Ana menü"
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-2xl justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] transition-transform duration-300 ease-out",
          scrollHidden && "translate-y-[calc(100%+1rem)]",
        )}
      >
        <ul className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-950 p-1 shadow-float ring-1 ring-white/10 dark:bg-neutral-900">
          {MAIN_TABS.map((tab) => {
            const active = tab.match.some((m) => isRouteActive(pathname, m));
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={tab.label}
                  title={tab.label}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-full outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-white/40",
                    active
                      ? "gap-1.5 bg-white pr-4 pl-3.5 text-sm font-semibold text-neutral-950"
                      : "w-11 border border-white/15 text-white/85 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-5 shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  {active ? <span className="hidden whitespace-nowrap min-[360px]:inline">{tab.label}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
