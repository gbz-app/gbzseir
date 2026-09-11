import * as React from "react";
import { cn } from "@/lib/utils";

/** Solid band: no gradient, border or shadow; side and bottom safe areas padded inside. */
const DOCK_SHELL =
  "bg-background pt-3 pr-[calc(1rem+env(safe-area-inset-right,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pl-[calc(1rem+env(safe-area-inset-left,0px))]";

/**
 * Bottom action bar ("dock") of the pages that hide the bottom nav: detail pages, owner forms, the support flow.
 * Full width at every screen size, one flat bg-background band; its content is centred up to the app column width.
 * Server-safe.
 *
 * `inFlow`: the last row of a fixed full-screen flex column (FormScreen) instead of fixed to the viewport.
 * A fixed dock needs BottomDockSpacer / BOTTOM_DOCK_SPACE at the end of the content so nothing hides behind it.
 */
export function BottomDock({ children, className, inFlow }: { children: React.ReactNode; className?: string; inFlow?: boolean }) {
  return (
    <div className={cn(inFlow ? "shrink-0" : "fixed inset-x-0 bottom-0 z-40", DOCK_SHELL, className)}>
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}

/** Bottom padding for content under a one-row BottomDock (dock: 0.75rem + h-14 row + 0.75rem + safe area; plus air). */
export const BOTTOM_DOCK_SPACE = "pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]";

/** Empty block with the height of a one-row BottomDock (+ air), for content that cannot take BOTTOM_DOCK_SPACE. */
export function BottomDockSpacer({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-[calc(6.5rem+env(safe-area-inset-bottom,0px))] shrink-0", className)} />;
}
