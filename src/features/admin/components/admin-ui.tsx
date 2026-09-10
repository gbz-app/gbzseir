import Image from "next/image";
import Link from "next/link";
import Form from "next/form";
import { ChevronLeft, ChevronRight, ImageOff, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withQuery, type QueryRecord } from "@/core/routes";
import { formatNumber } from "@/core/format";
import type { LabelMap } from "../lib/labels";

/** Server-safe building blocks shared by the admin screens. */

export function StatusBadge({ map, value, className }: { map: LabelMap; value: string | null | undefined; className?: string }) {
  if (!value) return null;
  const entry = map[value];
  return (
    <Badge variant={entry?.tone ?? "secondary"} className={cn("h-6 px-2.5", className)}>
      {entry?.label ?? value}
    </Badge>
  );
}

export function AdminCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag className={cn("min-w-0 rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="font-heading text-base font-bold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}

export type FilterTab = { label: string; href: string; active: boolean; count?: number | null };

/** URL-driven filter pills (horizontal scroll on phones). */
export function FilterTabs({ items, ariaLabel, className }: { items: FilterTab[]; ariaLabel: string; className?: string }) {
  return (
    <nav aria-label={ariaLabel} className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0", className)}>
      <ul className="flex w-max gap-2 pb-1">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                it.active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {it.label}
              {typeof it.count === "number" ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                    it.active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {formatNumber(it.count)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Previous / next pagination driven by ?sayfa=N. */
export function AdminPagination({
  path,
  query,
  page,
  pageSize,
  total,
}: {
  path: string;
  query: QueryRecord;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => withQuery(path, { ...query, sayfa: p > 1 ? p : undefined });
  return (
    <nav aria-label="Sayfalar" className="mt-4 flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Sayfa {page} / {pages} · {formatNumber(total)} kayıt
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={href(page - 1)}>
              <ChevronLeft aria-hidden /> Önceki
            </Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="outline">
            <Link href={href(page + 1)}>
              Sonraki <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/** GET search form (client-side navigation via next/form). Extra params are kept as hidden inputs. */
export function SearchBox({
  action,
  defaultValue,
  placeholder,
  label,
  hidden,
  className,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  label: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <Form action={action} role="search" className={cn("flex w-full max-w-md gap-2", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} aria-label={label} className="h-11 pl-9" />
      </div>
      <Button type="submit" variant="outline">
        Ara
      </Button>
    </Form>
  );
}

/** Dashboard number tile (optionally a link). */
export function StatTile({
  label,
  value,
  href,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "success" | "info" | "danger";
  hint?: string;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-highlight-soft text-highlight-foreground",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", toneClass)}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-shadow outline-none hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Label / value grid. */
export function InfoList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm", className)}>{children}</dl>;
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children ?? "-"}</dd>
    </>
  );
}

/**
 * Small thumbnail. Unoptimized on purpose: sources are already thumbnails and may live on hosts outside
 * next.config images.remotePatterns (seeded/demo data).
 */
export function AdminThumb({ src, alt = "", size = 72, className }: { src: string | null | undefined; alt?: string; size?: number; className?: string }) {
  if (!src) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <ImageOff className="size-5" />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 rounded-xl bg-muted object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Card-wrapped empty state for list screens. */
export function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">{children}</div>;
}
