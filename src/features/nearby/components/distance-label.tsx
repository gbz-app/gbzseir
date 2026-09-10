"use client";

import { Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { distanceMeters, formatDistance } from "@/core/geo";
import { useReferencePoint } from "../lib/use-reference-point";

/** "1,2 km" from the stored location (never prompts). Renders nothing when no location is known. */
export function DistanceLabel({ lat, lng, className, withIcon }: { lat: number | null; lng: number | null; className?: string; withIcon?: boolean }) {
  const { point } = useReferencePoint();
  if (!point || typeof lat !== "number" || typeof lng !== "number") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      {withIcon ? <Navigation className="size-3.5" aria-hidden /> : null}
      {formatDistance(distanceMeters(point, { lat, lng }))}
    </span>
  );
}
