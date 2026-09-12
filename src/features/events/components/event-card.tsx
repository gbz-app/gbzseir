import * as React from "react";
import Link from "next/link";
import { CalendarDays, MapPin, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatTime } from "@/core/format";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import { districtBySlug } from "@/config/districts";
import { vocabIcon } from "@/features/business/lib/verticals";
import { dateBadge, eventPriceLabel, isMultiDay } from "../format";
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

/** "12 Eyl · 20:00", "Bugün · 20:00" / "Yarın · 20:00" once `now` is known, "12 Eyl - 14 Eyl · 10:00" for several days. */
function whenLine(e: Pick<EventItem, "starts_at" | "ends_at">, now?: Date | null): string {
  const start = dateBadge(e.starts_at);
  let day = `${start.day} ${start.month}`;
  if (e.ends_at && isMultiDay(e.starts_at, e.ends_at)) {
    const end = dateBadge(e.ends_at);
    day = `${day} - ${end.day} ${end.month}`;
  } else if (now) {
    const key = istanbulDateKey(new Date(e.starts_at));
    const today = istanbulDateKey(now);
    if (key === today) day = "Bugün";
    else if (key === addDaysToKey(today, 1)) day = "Yarın";
  }
  return `${day} · ${formatTime(e.starts_at)}`;
}

/**
 * Event card: white surface, a rounded 16:9 photo with the price as a pill ("Ücretsiz" green, "250 TL" white), then one
 * line with the category icon, "12 Eyl · 20:00 · Konser", the title and the place. No shadows or borders. Server-safe.
 * `interactive={false}` renders it without a link (wizard preview). `now` (client, after mount) turns the date into
 * "Bugün" / "Yarın".
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
  const where = eventPlaceLine(event);
  const price = event.is_free ? "Ücretsiz" : event.price_try != null ? eventPriceLabel(event) : null;
  const line = [whenLine(event, now), event.category_label].filter(Boolean).join(" · ");
  const cls = cn("group block h-full rounded-media bg-card p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className);
  const body = (
    <>
      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-muted">
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
        {price ? (
          <span
            className={cn(
              "absolute top-2.5 right-2.5 inline-flex h-7 items-center rounded-full px-3 text-xs font-bold tabular-nums",
              event.is_free ? "bg-emerald-500 text-white" : "bg-card text-foreground",
            )}
          >
            {price}
          </span>
        ) : null}
      </div>

      <div className="px-2 pt-3 pb-1.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-primary">
          <EventCategoryIcon icon={event.category_icon} className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{line}</span>
        </p>
        <h3 className="mt-1 line-clamp-2 text-base leading-snug font-semibold">{event.title}</h3>
        {where ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{where}</span>
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
