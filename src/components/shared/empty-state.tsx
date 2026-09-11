import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type EmptyStateProps = {
  /** Lucide icon component (default Inbox). */
  icon?: LucideIcon;
  /** Custom illustration instead of the icon bubble. */
  illustration?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Convenience primary action as a link. */
  actionLabel?: string;
  actionHref?: string;
  /** Any custom action node(s) (buttons). Rendered after actionHref. */
  action?: React.ReactNode;
  /** Color of the icon bubble. */
  tone?: "default" | "brand" | "warning";
  /** Less vertical padding (inside cards / sheets). */
  compact?: boolean;
  className?: string;
};

const toneClass = {
  default: "bg-muted text-muted-foreground",
  brand: "bg-brand-soft text-primary",
  warning: "bg-highlight-soft text-highlight-foreground",
} as const;

/** Friendly empty / "Yakında" state. Server-safe (pass only serializable props from client parents if needed). */
export function EmptyState({
  icon: Icon = Inbox,
  illustration,
  title,
  description,
  actionLabel,
  actionHref,
  action,
  tone = "brand",
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}>
      {illustration ?? (
        <div className={cn("flex items-center justify-center rounded-card", compact ? "size-14" : "size-20", toneClass[tone])}>
          <Icon className={compact ? "size-7" : "size-9"} strokeWidth={1.8} aria-hidden />
        </div>
      )}
      <h2 className={cn("font-bold text-balance", compact ? "text-base" : "text-xl")}>{title}</h2>
      {description ? <p className="max-w-sm text-sm leading-relaxed text-balance text-muted-foreground">{description}</p> : null}
      {actionHref || action ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actionHref && actionLabel ? (
            <Button asChild>
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
