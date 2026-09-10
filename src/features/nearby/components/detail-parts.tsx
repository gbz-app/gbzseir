import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card with the kind icon, eyebrow (type · neighbourhood), big name and badges. Server-safe. */
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
    <section className={cn("rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]", className)}>
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

/** Definition list container for address / phone / hours rows. */
export function InfoList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]", className)}>{children}</dl>;
}

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
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
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

/** Fixed bottom action bar (Ara / Yol tarifi) for detail pages that hide the bottom nav. */
export function StickyActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-float backdrop-blur-md",
        className,
      )}
    >
      <div className="flex gap-2 [&>*]:flex-1">{children}</div>
    </div>
  );
}

/** Bottom spacing so content is not hidden behind StickyActionBar. */
export const STICKY_BAR_SPACE = "pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]";
