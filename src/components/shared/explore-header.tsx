"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { canGoBack } from "@/lib/navigation-history";

export const ROUND_ICON_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-foreground/[0.06] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/** Large-title header of the explore lists (Keşfet, Etkinlikler): round back button, title, subtitle, right slot. */
export function ExploreHeader({
  title,
  subtitle,
  backHref = "/",
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="pt-safe">
      <div className="flex h-(--topbar-h) items-center justify-between gap-2">
        <button type="button" aria-label="Geri" className={ROUND_ICON_BUTTON} onClick={() => (canGoBack() ? router.back() : router.push(backHref))}>
          <ChevronLeft className="size-6" strokeWidth={1.75} />
        </button>
        {right}
      </div>
      <h1 className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

/** Pill filter chip used in the explore lists. */
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
          : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium text-foreground shadow-soft ring-1 ring-foreground/[0.07] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
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
