import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_DOCK_SPACE, BottomDock } from "@/components/shared/bottom-dock";

/** Card with the kind icon, eyebrow (type · district), big name and badges. Server-safe. */
export function DetailHero({
  icon,
  eyebrow,
  title,
  badges,
  children,
  className,
}: {
  icon: React.ReactNode;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[1.75rem] bg-card p-4", className)}>
      <div className="flex items-start gap-3.5">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
          <p className="mt-0.5 text-xl leading-tight font-extrabold text-balance break-words">{title}</p>
          {badges ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

/**
 * Definition list card for address / phone / hours rows: the home page's corner family (28 px card), rows kept apart by
 * spacing instead of divider lines.
 */
export function InfoList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("flex flex-col gap-1 rounded-[1.75rem] bg-card p-2", className)}>{children}</dl>;
}

/** One row of InfoList: a tinted icon tile, the label (13 px, muted), the value (15 px) and an optional action on the right. */
export function InfoRow({
  icon: Icon,
  label,
  children,
  action,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-2 py-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground" aria-hidden>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[13px] leading-tight font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-[15px] leading-snug font-medium break-words">{children}</dd>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Section with a small heading. */
export function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Fixed bottom action bar (Ara / Yol tarifi) for detail pages that hide the bottom nav, in the shared BottomDock. */
export function StickyActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <BottomDock className={className}>
      <div className="flex gap-2 [&>*]:flex-1">{children}</div>
    </BottomDock>
  );
}

/** Bottom spacing so content is not hidden behind StickyActionBar. */
export const STICKY_BAR_SPACE = BOTTOM_DOCK_SPACE;
