import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { DemoBadge } from "@/components/shared/badges";
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

/** Where the event happens, for one card line: place name, the organizer business, or the neighbourhood. */
export function eventPlaceLine(e: Pick<EventItem, "venue_name" | "neighbourhood_name" | "business">): string | null {
  return e.venue_name ?? (e.neighbourhood_name ? `${e.neighbourhood_name} Mah.` : (e.business?.name ?? null));
}

/**
 * Big photo card of an event in the /kesfet style: white date badge, category pill, floating white info panel with
 * the title, "Cumartesi · 20:00", the place and a black arrow. No shadows. Server-safe.
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
  const cls = cn("group block overflow-hidden rounded-[1.75rem] bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className);
  const body = (
    <div className="relative aspect-[5/4] max-h-[20.8rem] w-full">
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
        <EventCoverFallback icon={event.category_icon} />
      )}
      <span className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/25 to-transparent" aria-hidden />

      <span className="absolute top-3 left-3 flex min-w-[3.25rem] flex-col items-center rounded-2xl bg-card px-2.5 pt-1.5 pb-1 leading-none">
        <span className="text-xl font-bold tabular-nums">{badge.day}</span>
        <span className="mt-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase">{badge.month}</span>
      </span>
      <span className="absolute top-3 right-3 inline-flex h-8 max-w-[55%] items-center gap-1.5 rounded-full bg-card px-3 text-xs font-semibold">
        <EventCategoryIcon icon={event.category_icon} className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{event.category_label}</span>
      </span>

      <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-3 rounded-[1.35rem] bg-card py-3 pr-3 pl-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 truncate text-base leading-snug font-semibold">{event.title}</h3>
            {event.is_demo ? <DemoBadge label="Örnek" className="h-5 shrink-0 px-1.5 text-[11px]" /> : null}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
            <span className="truncate font-medium">{eventWhenLine(event.starts_at, event.ends_at, now)}</span>
            {event.is_free ? (
              <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">· Ücretsiz</span>
            ) : event.price_try != null ? (
              <span className="shrink-0 text-muted-foreground">· {eventPriceLabel(event)}</span>
            ) : null}
          </p>
          {where ? (
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{where}</span>
            </p>
          ) : null}
        </div>
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-45 motion-reduce:transition-none motion-reduce:group-hover:rotate-0"
          aria-hidden
        >
          <ArrowUpRight className="size-5" />
        </span>
      </div>
    </div>
  );
  if (!interactive) return <div className={cls}>{body}</div>;
  return (
    <Link href={routes.events.detail(event.slug)} className={cls}>
      {body}
    </Link>
  );
}
