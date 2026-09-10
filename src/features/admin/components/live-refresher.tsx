"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Re-renders the (server) page every `seconds` while the tab is visible: keeps "online now" live. */
export function LiveRefresher({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      Canlı · {seconds} sn&apos;de bir yenilenir
    </span>
  );
}
