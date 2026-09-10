"use client";

import * as React from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { NavigationTracker } from "@/lib/navigation-history";
import { AnalyticsTracker } from "@/lib/analytics/tracker";

/** All client-side providers, mounted once in the root layout. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster position="top-center" closeButton offset={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }} />
          <ServiceWorkerRegistrar />
          <NavigationTracker />
          <AnalyticsTracker />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
