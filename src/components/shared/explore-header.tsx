"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canGoBack } from "@/lib/navigation-history";
import { cn } from "@/lib/utils";
import { IDLE_CHIP_BG } from "./chip-filter";

export const ROUND_ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-foreground/[0.06] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Large-title header of the explore lists (Keşfet, Etkinlikler): round back button, title, subtitle, right slot.
 * The title is usually text; Yemek and Restoran put their "Yemek · Restoran" switch there.
 */
export function ExploreHeader({
  title,
  subtitle,
  backHref = "/",
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="pt-safe">
      <div className="flex h-(--topbar-h) items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Geri"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground backdrop-blur-md transition-colors outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => (canGoBack() ? router.back() : router.push(backHref))}
        >
          <ArrowLeft className="size-5" strokeWidth={2.2} />
        </button>
        {right}
      </div>
      <h1 className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

/**
 * Pill filter chip used in the explore lists: white when idle (muted on a white card or dialog, see IDLE_CHIP_BG),
 * black (foreground) when on; no border, ring or shadow.
 */
export function FilterChip({
  active,
  onClick,
  children,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-sm font-semibold text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          : cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50", IDLE_CHIP_BG)
      }
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Current time, set only after mount (keeps server and client HTML identical) and refreshed every minute. */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
