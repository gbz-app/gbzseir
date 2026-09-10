"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/** Neutral placeholder shown until the map chunk (maplibre, ~800 KB) has loaded. */
export function MapPlaceholder({ className, label = "Harita yükleniyor…" }: { className?: string; label?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-[#efe9e1] dark:bg-[#1f2826]",
        "bg-[linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] bg-[size:28px_28px]",
        "dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)]",
        className,
      )}
      role="status"
      aria-label={label}
    >
      <MapPin className="size-8 text-muted-foreground/50" aria-hidden />
    </div>
  );
}

/** The maplibre map, loaded on the client only. */
export const LazyNearbyMap = dynamic(() => import("./nearby-map").then((m) => m.NearbyMap), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});
