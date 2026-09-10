"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Tiny in-app history tracker so back buttons can decide between router.back() and a fallback href
 * (deep links opened from Google/SMS have no in-app history).
 */
const stack: string[] = [];

/** Mounted once in AppProviders. */
export function NavigationTracker(): null {
  const pathname = usePathname();
  React.useEffect(() => {
    if (!pathname) return;
    const last = stack[stack.length - 1];
    if (last === pathname) return;
    if (stack.length >= 2 && stack[stack.length - 2] === pathname) stack.pop();
    else stack.push(pathname);
    if (stack.length > 50) stack.splice(0, stack.length - 50);
  }, [pathname]);
  return null;
}

/** True when there is an earlier in-app page to go back to. */
export function canGoBack(): boolean {
  return stack.length > 1;
}
