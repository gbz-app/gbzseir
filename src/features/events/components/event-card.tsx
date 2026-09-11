import Link from "next/link";
import { ArrowUpRight, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { DemoBadge } from "@/components/shared/badges";
import { EVENT_CATEGORY_INFO } from "@/features/business/lib/verticals";
import { dateBadge, eventPriceLabel, eventWhenShort } from "../format";
import type { EventItem } from "../queries";

/** Big photo card of an event: calendar badge, category chip, floating info panel with an arrow. Server-safe. */
export function EventCard({ event, eager, className }: { event: EventItem; eager?: boolean; className?: string }) {
  const badge = dateBadge(event.starts_at);
  const cat = EVENT_CATEGORY_INFO[event.category];
  const where = event.venue_name ?? (event.neighbourhood_name ? `${event.neighbourhood_name} Mah.` : null);
  return (
    <Link
      href={routes.events.detail(event.slug)}
      className={cn(
        "group block overflow-hidden rounded-[1.75rem] bg-muted shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <div className="relative aspect-[4/3.4] w-full">
        {event.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_url}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-fuchsia-100 via-brand-soft to-highlight-soft">
            <Ticket className="size-14 text-primary/40" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        <span className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/30 to-transparent" aria-hidden />

        <span className="absolute top-3 left-3 flex min-w-12 flex-col items-center rounded-2xl bg-card/95 px-2.5 py-1.5 leading-none shadow-soft backdrop-blur">
          <span className="text-lg font-bold tabular-nums">{badge.day}</span>
          <span className="mt-0.5 text-[11px] font-semibold text-primary uppercase">{badge.month}</span>
        </span>
        <span className="absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-card/90 px-3 text-xs font-semibold shadow-soft backdrop-blur">
          <cat.icon className="size-3.5" aria-hidden />
          {cat.label}
        </span>

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-3 rounded-[1.35rem] bg-card/95 py-3 pr-3 pl-4 shadow-soft backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-base leading-snug font-semibold">{event.title}</h3>
              {event.is_demo ? <DemoBadge label="Örnek" className="h-5 shrink-0 px-1.5 text-[11px]" /> : null}
            </div>
            {where ? (
              <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{where}</span>
              </p>
            ) : null}
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px]">
              <span className="truncate font-medium">{eventWhenShort(event.starts_at, event.ends_at)}</span>
              <span className={cn("shrink-0 font-semibold", event.is_free ? "text-emerald-600 dark:text-emerald-400" : "")}>{eventPriceLabel(event)}</span>
            </p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-45" aria-hidden>
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
