"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { APP_NAME } from "@/config/site";

/** lib.dom no longer types ScreenOrientation.lock (Chromium-only; iOS has none). */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: "portrait") => Promise<void> };

function isInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Portrait-only app. The installed PWA is locked to portrait (manifest `orientation` + a Screen Orientation lock
 * request; browsers that refuse it are ignored). Phones held sideways get a full-screen "hold it upright" notice;
 * `.gz-landscape-guard` in globals.css shows it only on short, touch, landscape viewports, so tablets and desktops
 * never see it (no JS needed). Mounted once in the root layout (public app only).
 */
export function OrientationGuard() {
  React.useEffect(() => {
    if (!isInstalledApp()) return;
    try {
      const orientation = screen.orientation as LockableOrientation | undefined;
      orientation?.lock?.("portrait").catch(() => undefined);
    } catch {
      // Not supported here: the landscape notice still covers it.
    }
  }, []);

  return (
    <div role="status" className="gz-landscape-guard fixed inset-0 z-[200] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-card bg-brand-soft text-primary">
        <RotateCcw className="size-8" strokeWidth={1.75} aria-hidden />
      </span>
      <div>
        <p className="text-lg font-semibold">Telefonunu dik tut</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{APP_NAME} dikey kullanım için tasarlandı.</p>
      </div>
    </div>
  );
}
