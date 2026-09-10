"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "@/core/routes";
import { BOTTOM_NAV_HIDDEN_PREFIXES, MAIN_TABS } from "./nav-config";
import { useBottomNavHidden, useHideOnScroll } from "./nav-visibility";

/** Fixed 5-tab bottom navigation with safe-area padding; hides on scroll-down and on full-screen flows. */
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
          "fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl border-t bg-background/90 pb-safe shadow-float backdrop-blur-md transition-transform duration-300 ease-out",
          scrollHidden && "translate-y-full",
        )}
      >
        <ul className="grid h-(--bottomnav-h) grid-cols-5">
          {MAIN_TABS.map((tab) => {
            const active = tab.match.some((m) => isRouteActive(pathname, m));
            const Icon = tab.icon;
            return (
              <li key={tab.href} className="flex">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground transition-colors outline-none focus-visible:text-primary",
                    active && "text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
                      active && "bg-brand-soft",
                    )}
                  >
                    <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                  </span>
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
