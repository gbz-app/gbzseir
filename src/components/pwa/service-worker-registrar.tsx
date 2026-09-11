"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCwIcon } from "lucide-react";
import { initInstallCapture } from "@/lib/pwa/install-store";

/**
 * Registers /sw.js (production only) and offers "Yeni sürüm hazır - Yenile" when an updated worker is waiting.
 * Also starts capturing the Android install prompt as early as possible.
 * Kill switch: NEXT_PUBLIC_DISABLE_SW=true unregisters every worker.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    initInstallCapture();
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NEXT_PUBLIC_DISABLE_SW === "true") {
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      return;
    }
    if (process.env.NODE_ENV !== "production") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const offerUpdate = (worker: ServiceWorker) => {
      toast.info("Yeni sürüm hazır", {
        id: "sw-update",
        description: "En güncel sürümü kullanmak için yenile.",
        icon: <RefreshCwIcon className="size-5" aria-hidden />,
        duration: Infinity,
        // It never auto-closes and sits over the header, so it keeps an X even where the Toaster has none.
        closeButton: true,
        action: {
          label: "Yenile",
          onClick: () => {
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    let onVisible: (() => void) | null = null;
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) offerUpdate(w);
          });
        });
        onVisible = () => {
          if (document.visibilityState === "visible") reg.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVisible);
      } catch {
        /* SW is progressive enhancement */
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });

    return () => {
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
