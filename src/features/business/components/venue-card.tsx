"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/core/format";
import { formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { describeOpenStatus, isVacationStatus, type OpenStatus } from "../lib/hours";
import type { VerticalCard } from "../lib/vertical-queries";
import { VERTICAL_INFO, priceLevelInfo } from "../lib/verticals";
import { formatRating } from "./rating";

export type VenueCardProps = {
  item: VerticalCard;
  /** Meters from the user's point (null = unknown, hidden). */
  distance: number | null;
  /** Open/closed/tatilde now (null until mounted). Hotels only carry the tatil state. */
  open: OpenStatus | null;
  eager?: boolean;
  /** "compact": small card for the two-column grid (Sağlık). */
  variant?: "default" | "compact";
};

/** Photo placeholder with the vertical icon (no photo uploaded yet). */
export function VenuePhotoFallback({ vertical, className, iconClassName }: { vertical: VerticalCard["vertical"]; className?: string; iconClassName?: string }) {
  const info = VERTICAL_INFO[vertical];
  return (
    <span className={cn("absolute inset-0 flex items-center justify-center bg-linear-to-br from-brand-soft via-muted to-highlight-soft", className)}>
      <info.icon className={cn("size-14 text-primary/40", iconClassName)} strokeWidth={1.5} aria-hidden />
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

type StatusTone = "open" | "vacation" | "muted";

const STATUS_TONE: Record<StatusTone, string> = {
  open: "text-emerald-600 dark:text-emerald-400",
  vacation: "text-highlight-foreground dark:text-highlight",
  muted: "text-muted-foreground",
};

/** "Tatilde" / "Açık · Kapanış 18:00" / "Açılış 09:00". Before mount (`open` null) only the tatil flag is known. */
function statusOf(item: VerticalCard, open: OpenStatus | null): { text: string | null; tone: StatusTone } {
  if (open ? isVacationStatus(open) : item.vacation_mode) return { text: "Tatilde", tone: "vacation" };
  if (!open) return { text: null, tone: "muted" };
  const text = describeOpenStatus(open);
  return open.known && open.open ? { text: text ? `Açık · ${text}` : "Açık", tone: "open" } : { text, tone: "muted" };
}

function RatingBadge({ item, small }: { item: VerticalCard; small?: boolean }) {
  if (item.rating_count <= 0) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inline-flex items-center gap-1 rounded-full bg-card/90 font-semibold tabular-nums shadow-soft backdrop-blur",
        small ? "top-3 left-3 h-7 px-2 text-xs" : "top-3 left-3 h-8 px-2.5 text-sm",
      )}
      aria-label={`5 üzerinden ${formatRating(item.rating_avg)} puan, ${item.rating_count} yorum`}
    >
      <Star className={cn("fill-highlight text-highlight", small ? "size-3.5" : "size-4")} aria-hidden />
      {formatRating(item.rating_avg)}
      <span className="font-medium text-muted-foreground">({item.rating_count})</span>
    </span>
  );
}

/** Big photo card of the vertical lists: rating badge, heart, floating white info panel with an arrow. */
export function VenueCard(props: VenueCardProps) {
  if (props.variant === "compact") return <CompactVenueCard {...props} />;
  const { item, distance, open, eager } = props;
  const price = priceLine(item);
  const where = [item.neighbourhood_name ? `${item.neighbourhood_name} Mah.` : null, distance != null ? formatDistance(distance) : null].filter(Boolean).join(" · ");
  const status = statusOf(item, open);

  return (
    <article className="relative">
      <Link
        href={routes.businesses.detail(item.slug)}
        className="group block overflow-hidden rounded-media bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[5/4] max-h-[20.8rem] w-full">
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

          <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-3 rounded-card bg-card/95 py-3 pr-3 pl-4 shadow-soft backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <h3 className="min-w-0 truncate text-base leading-snug font-semibold">{item.name}</h3>
              {where ? (
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{where}</span>
                </p>
              ) : null}
              {price || status.text || item.star_rating ? (
                <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px]">
                  {item.star_rating ? <span className="shrink-0 font-medium text-muted-foreground">{item.star_rating} yıldızlı</span> : null}
                  {price ? (
                    <span className="shrink-0">
                      <span className="font-semibold">{price.strong}</span>
                      {price.rest ? <span className="text-muted-foreground">{price.rest}</span> : null}
                    </span>
                  ) : null}
                  {status.text ? <span className={cn("truncate font-medium", STATUS_TONE[status.tone])}>{status.text}</span> : null}
                </p>
              ) : null}
            </div>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-45" aria-hidden>
              <ArrowUpRight className="size-5" />
            </span>
          </div>
        </div>
      </Link>

      <RatingBadge item={item} />
      <FavoriteButton targetType="business" targetId={item.id} variant="overlay" className="absolute top-2 right-2" />
    </article>
  );
}

/** Half-width card (two per row at 390 px): photo on top, name, category, place and open status below. */
function CompactVenueCard({ item, distance, open, eager }: VenueCardProps) {
  const where = [item.neighbourhood_name, distance != null ? formatDistance(distance) : null].filter(Boolean).join(" · ");
  const status = statusOf(item, open);

  return (
    <article className="relative h-full">
      <Link
        href={routes.businesses.detail(item.slug)}
        className="group flex h-full flex-col rounded-card bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-chip bg-muted">
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
            <VenuePhotoFallback vertical={item.vertical} iconClassName="size-10" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-1.5 pt-2 pb-1">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold">{item.name}</h3>
          {item.category_label ? <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{item.category_label}</p> : null}
          {where || status.text ? (
            <div className="mt-auto flex flex-col gap-0.5 pt-1.5 text-xs">
              {where ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{where}</span>
                </p>
              ) : null}
              {status.text ? <p className={cn("truncate font-medium", STATUS_TONE[status.tone])}>{status.text}</p> : null}
            </div>
          ) : null}
        </div>
      </Link>

      <RatingBadge item={item} small />
      <FavoriteButton targetType="business" targetId={item.id} variant="overlay" className="absolute top-2.5 right-2.5 size-9" />
    </article>
  );
}
