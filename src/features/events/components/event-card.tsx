import * as React from "react";
import Link from "next/link";
import { CalendarDays, MapPin, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { districtBySlug } from "@/config/districts";
import { vocabIcon } from "@/features/business/lib/verticals";
import { dateBadge, eventPriceLabel, eventWhenLine } from "../format";
import type { EventItem } from "../queries";

/** Lucide icon of an event category (the icon name stored in event_categories); CalendarDays when unknown. Server-safe. */
export function EventCategoryIcon({ icon, ...props }: { icon: string | null } & LucideProps) {
  return React.createElement(vocabIcon(icon, CalendarDays), props);
}

/** Cover placeholder: purple gradient with the category icon (no cover uploaded). */
export function EventCoverFallback({ icon, className, iconClassName }: { icon: string | null; className?: string; iconClassName?: string }) {
  return (
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-linear-to-br from-violet-200 via-brand-soft to-fuchsia-100 dark:from-violet-500/25 dark:via-brand-soft dark:to-fuchsia-500/15",
        className,
      )}
    >
      <EventCategoryIcon icon={icon} className={cn("size-14 text-primary/45", iconClassName)} strokeWidth={1.5} aria-hidden />
    </span>
  );
}

/** Where the event happens, for one card line: place name (or the organizer business) and the district, "Mor Salkım Otel · Gebze". */
export function eventPlaceLine(e: Pick<EventItem, "venue_name" | "district_id" | "business">): string | null {
  return [e.venue_name ?? e.business?.name, districtBySlug(e.district_id)?.name].filter(Boolean).join(" · ") || null;
}

/**
 * Event card: white surface, rounded photo (small date badge, category pill) and a calm text block under it
 * ("Cumartesi · 20:00", title, place and price). No shadows or borders. Server-safe.
 * `interactive={false}` renders it without a link (wizard preview). `now` (client, after mount) turns the weekday
 * into "Bugün" / "Yarın".
 */
export function EventCard({
  event,
  eager,
  className,
  interactive = true,
  now,
}: {
  event: EventItem;
  eager?: boolean;
  className?: string;
  interactive?: boolean;
  now?: Date | null;
}) {
  const badge = dateBadge(event.starts_at);
  const where = eventPlaceLine(event);
  const price = event.is_free ? "Ücretsiz" : event.price_try != null ? eventPriceLabel(event) : null;
  const cls = cn("group block h-full rounded-media bg-card p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className);
  const body = (
    <>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card bg-muted">
        {event.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_url}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <EventCoverFallback icon={event.category_icon} iconClassName="size-12" />
        )}
        <span className="absolute top-2.5 left-2.5 flex min-w-12 flex-col items-center rounded-2xl bg-card px-2.5 pt-1.5 pb-1 leading-none">
          <span className="text-lg font-bold tabular-nums">{badge.day}</span>
          <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">{badge.month}</span>
        </span>
        <span className="absolute top-2.5 right-2.5 inline-flex h-7 max-w-[55%] items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-semibold">
          <EventCategoryIcon icon={event.category_icon} className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{event.category_label}</span>
        </span>
      </div>

      <div className="px-2.5 pt-3 pb-2">
        <p className="truncate text-[13px] font-semibold text-primary">{eventWhenLine(event.starts_at, event.ends_at, now)}</p>
        <h3 className="mt-1 line-clamp-2 text-[17px] leading-snug font-semibold">{event.title}</h3>
        {where || price ? (
          <p className="mt-1.5 flex min-w-0 items-center gap-3 text-[13px] text-muted-foreground">
            {where ? (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{where}</span>
              </span>
            ) : null}
            {price ? <span className={cn("shrink-0 font-semibold", event.is_free ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{price}</span> : null}
          </p>
        ) : null}
      </div>
    </>
  );
  if (!interactive) return <div className={cls}>{body}</div>;
  return (
    <Link href={routes.events.detail(event.slug)} className={cls}>
      {body}
    </Link>
  );
}
