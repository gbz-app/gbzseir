"use client";

import { Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { appleDirectionsUrl, googleDirectionsUrl } from "@/core/geo";
import { logContactEvent, type ContactSubjectType } from "@/lib/contact";
import { isIOS } from "@/lib/platform";

export type DirectionsButtonProps = {
  lat: number;
  lng: number;
  /** Destination name (used by Apple Maps). */
  name?: string;
  label?: string;
  iconOnly?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  /** Optional: log a 'directions' contact_event for this subject (e.g. 'poi' + poi uuid, 'business'). */
  subjectType?: ContactSubjectType;
  subjectId?: string;
  className?: string;
};

/** Opens turn-by-turn directions: Apple Maps on iOS, Google Maps elsewhere. */
export function DirectionsButton({
  lat,
  lng,
  name,
  label = "Yol tarifi",
  iconOnly,
  variant = "outline",
  size = "default",
  subjectType,
  subjectId,
  className,
}: DirectionsButtonProps) {
  const target = { lat, lng, name };
  const href = googleDirectionsUrl(target);
  return (
    <Button asChild variant={variant} size={iconOnly ? "icon" : size} className={cn(iconOnly && "rounded-full", className)}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={iconOnly ? `${label}${name ? `: ${name}` : ""}` : undefined}
        onClick={(e) => {
          if (subjectType && subjectId) logContactEvent({ subjectType, subjectId, event: "directions" });
          if (isIOS()) {
            e.preventDefault();
            window.location.href = appleDirectionsUrl(target);
          }
        }}
      >
        <Navigation />
        {iconOnly ? null : label}
      </a>
    </Button>
  );
}
