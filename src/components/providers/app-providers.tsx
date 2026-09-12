"use client";

import * as React from "react";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { NavigationTracker } from "@/lib/navigation-history";
import { AnalyticsTracker } from "@/lib/analytics/tracker";
import { IS_ADMIN_SITE } from "@/config/app-mode";

/**
 * All client-side providers, mounted once in the root layout. The admin site has no service worker or analytics. No theme
 * provider: the app is light only (ThemeScript).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        {/* Look, position and durations live in ui/sonner. Phones dismiss by swipe; the desktop admin keeps an X. */}
        <Toaster closeButton={IS_ADMIN_SITE} />
        {IS_ADMIN_SITE ? null : <ServiceWorkerRegistrar />}
        <NavigationTracker />
        {IS_ADMIN_SITE ? null : <AnalyticsTracker />}
      </TooltipProvider>
    </AuthProvider>
  );
}
