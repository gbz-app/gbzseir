import Link from "next/link";
import { BadgeCheck, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { initials } from "@/core/format";
import { RelativeTime } from "@/components/shared/relative-time";
import { CONDITIONS, WORK_TYPES, optionLabel } from "../constants";
import { isSalaryVisible, listingPriceText, salaryText } from "../format";
import type { ListingCardData } from "../types";
import { benefitOptions } from "../view-models";
import { CategoryIcon } from "./category-icon";
import { ListingFavoriteButton } from "./favorites";

type HeadingLevel = "h2" | "h3";

/** Photo placeholder (demo listings and listings without photos): the category icon on a soft background. */
export function ListingPlaceholder({ icon, className, iconClassName, fallback = "tag" }: { icon: string | null; className?: string; iconClassName?: string; fallback?: "tag" | "briefcase" }) {
  return (
    <div className={cn("flex size-full items-center justify-center bg-gradient-to-br from-brand-soft to-muted", className)}>
      <CategoryIcon iconName={icon} fallback={fallback} className={cn("size-10 text-primary/60", iconClassName)} strokeWidth={1.6} />
    </div>
  );
}

/** Square company logo or initials. */
export function CompanyLogo({ name, logoUrl, className }: { name: string | null | undefined; logoUrl: string | null | undefined; className?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" loading="lazy" decoding="async" className={cn("size-12 shrink-0 rounded-xl bg-card object-cover ring-1 ring-foreground/10", className)} />
    );
  }
  return (
    <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-base font-extrabold text-primary", className)}>
      {initials(name)}
    </span>
  );
}

/** 2. el card for the 2-column grid. */
export function ClassifiedCard({ item, headingLevel: H = "h3", className }: { item: ListingCardData; headingLevel?: HeadingLevel; className?: string }) {
  const condition = optionLabel(CONDITIONS, item.condition);
  return (
    <li className={cn("relative", className)}>
      <Link
        href={routes.listings.classified(item.id)}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06] outline-none transition-shadow hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover.thumbUrl ?? item.cover.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <ListingPlaceholder icon={item.categoryIcon} />
          )}
          {item.isBusiness ? (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-white">İşletme</span>
          ) : item.condition === "sifir" ? (
            <span className="absolute bottom-2 left-2 rounded-md bg-success px-1.5 py-0.5 text-[11px] font-bold text-success-foreground">{condition}</span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="text-base leading-tight font-extrabold tabular-nums">{listingPriceText(item.price)}</p>
          <H className="mt-1 line-clamp-2 text-sm leading-snug font-semibold">{item.title}</H>
          <div className="mt-auto pt-2 text-xs text-muted-foreground">
            {item.neighbourhoodName ? (
              <p className="flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{item.neighbourhoodName}</span>
              </p>
            ) : null}
            <RelativeTime date={item.postedAt} className="mt-0.5 block" />
          </div>
        </div>
      </Link>
      <div className="absolute top-1.5 right-1.5">
        <ListingFavoriteButton listingId={item.id} variant="overlay" />
      </div>
    </li>
  );
}

/** Compact 2. el card for horizontal rails (home). */
export function ClassifiedRailCard({ item }: { item: ListingCardData }) {
  return (
    <li className="w-[9.5rem] shrink-0 snap-start">
      <Link
        href={routes.listings.classified(item.id)}
        className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.cover.thumbUrl ?? item.cover.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <ListingPlaceholder icon={item.categoryIcon} iconClassName="size-9" />
          )}
        </div>
        <div className="flex flex-1 flex-col p-2.5">
          <p className="text-sm leading-tight font-extrabold tabular-nums">{listingPriceText(item.price)}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-semibold">{item.title}</h3>
          {item.neighbourhoodName ? <p className="mt-auto truncate pt-1 text-xs text-muted-foreground">{item.neighbourhoodName}</p> : null}
        </div>
      </Link>
    </li>
  );
}

/** İş ilanı card (list). */
export function JobCard({ item, headingLevel: H = "h3", className }: { item: ListingCardData; headingLevel?: HeadingLevel; className?: string }) {
  const work = optionLabel(WORK_TYPES, item.workType);
  const location = [item.locationLabel, item.neighbourhoodName].filter(Boolean).join(" · ");
  const verified = (item.business?.verification_level ?? 0) >= 1;
  const showSalary = isSalaryVisible(item.salaryMin, item.salaryMax, item.salaryHidden);
  const benefits = benefitOptions(item.benefits);
  return (
    <li className={cn("relative", className)}>
      <Link
        href={routes.listings.job(item.id)}
        className="block rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06] outline-none transition-shadow hover:shadow-card focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex items-start gap-3 pr-10">
          <CompanyLogo name={item.business?.name} logoUrl={item.business?.logo_url} />
          <div className="min-w-0 flex-1">
            <H className="line-clamp-2 text-[15px] leading-snug font-bold">{item.title}</H>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">{item.business?.name ?? "İşletme"}</span>
              {verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Onaylı işletme" /> : null}
            </p>
          </div>
        </div>
        {location || work ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
            {location ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{location}</span>
              </span>
            ) : null}
            {work ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                {work}
              </span>
            ) : null}
          </div>
        ) : null}
        {benefits.length ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Yan haklar">
            {benefits.map((b) => (
              <li key={b.value} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                {b.label}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
          {showSalary ? (
            <span className="text-[15px] font-bold tabular-nums">{salaryText(item.salaryMin, item.salaryMax, item.salaryHidden)}</span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Maaş görüşülür</span>
          )}
          <RelativeTime date={item.postedAt} className="shrink-0 text-xs text-muted-foreground" />
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <ListingFavoriteButton listingId={item.id} />
      </div>
    </li>
  );
}
