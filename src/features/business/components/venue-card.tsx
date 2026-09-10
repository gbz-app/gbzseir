"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import { formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { describeOpenStatus, type OpenStatus } from "../lib/hours";
import type { VerticalCard } from "../lib/vertical-queries";
import { VERTICAL_INFO, priceLevelInfo } from "../lib/verticals";
import { formatRating } from "./rating";

export type VenueCardProps = {
  item: VerticalCard;
  /** Meters from the user's point (null = unknown, hidden). */
  distance: number | null;
  /** Open/closed now (null until mounted, and for hotels). */
  open: OpenStatus | null;
  eager?: boolean;
};

/** Photo placeholder with the vertical icon (no photo uploaded yet). */
export function VenuePhotoFallback({ vertical, className }: { vertical: VerticalCard["vertical"]; className?: string }) {
  const info = VERTICAL_INFO[vertical];
  return (
    <span className={cn("absolute inset-0 flex items-center justify-center bg-linear-to-br from-brand-soft via-muted to-highlight-soft", className)}>
      <info.icon className="size-14 text-primary/40" strokeWidth={1.5} aria-hidden />
    </span>
  );
}

function priceLine(item: VerticalCard): { strong: string; rest?: string } | null {
  if (item.vertical === "otel") {
    return item.min_room_price != null ? { strong: formatPrice(item.min_room_price), rest: " / gece" } : null;
  }
  const level = priceLevelInfo(item.price_level);
  return level ? { strong: level.symbol, rest: ` · ${level.label}` } : null;
}

/** Big photo card of the vertical lists: rating badge, heart, floating white info panel with an arrow. */
export function VenueCard({ item, distance, open, eager }: VenueCardProps) {
  const price = priceLine(item);
  const where = [item.neighbourhood_name ? `${item.neighbourhood_name} Mah.` : null, distance != null ? formatDistance(distance) : null].filter(Boolean).join(" · ");
  const status = item.vacation_mode ? "Tatilde" : open ? describeOpenStatus(open) : null;
  const isOpen = !item.vacation_mode && !!open?.known && open.open;

  return (
    <article className="relative">
      <Link
        href={routes.businesses.detail(item.slug)}
        className="group block overflow-hidden rounded-[1.75rem] bg-muted shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-square max-h-[26rem] w-full">
          {item.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photo_url}
              alt=""
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <VenuePhotoFallback vertical={item.vertical} />
          )}
          <span className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/30 to-transparent" aria-hidden />

          <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-3 rounded-[1.35rem] bg-card/95 py-3 pr-3 pl-4 shadow-soft backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base leading-snug font-semibold">{item.name}</h3>
              {where ? (
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{where}</span>
                </p>
              ) : null}
              {price || status || item.star_rating ? (
                <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px]">
                  {item.star_rating ? <span className="shrink-0 font-medium text-muted-foreground">{item.star_rating} yıldızlı</span> : null}
                  {price ? (
                    <span className="shrink-0">
                      <span className="font-semibold">{price.strong}</span>
                      {price.rest ? <span className="text-muted-foreground">{price.rest}</span> : null}
                    </span>
                  ) : null}
                  {status ? (
                    <span className={cn("truncate font-medium", isOpen ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      {isOpen ? "Açık · " : ""}
                      {status}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-45" aria-hidden>
              <ArrowUpRight className="size-5" />
            </span>
          </div>
        </div>
      </Link>

      {item.rating_count > 0 ? (
        <span
          className="pointer-events-none absolute top-3 left-3 inline-flex h-8 items-center gap-1 rounded-full bg-card/90 px-2.5 text-sm font-semibold tabular-nums shadow-soft backdrop-blur"
          aria-label={`5 üzerinden ${formatRating(item.rating_avg)} puan, ${item.rating_count} yorum`}
        >
          <Star className="size-4 fill-highlight text-highlight" aria-hidden />
          {formatRating(item.rating_avg)}
          <span className="font-medium text-muted-foreground">({item.rating_count})</span>
        </span>
      ) : null}
      <FavoriteButton targetType="business" targetId={item.id} variant="overlay" className="absolute top-2 right-2" />
    </article>
  );
}
