import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pill chip without shadow or border: white on the lavender page, black when active. */
export function EventChip({
  active,
  onClick,
  icon: Icon,
  children,
  className,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  /** Small number after the label (tab counts). */
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
      {count !== undefined ? <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground")}>{count}</span> : null}
    </button>
  );
}
