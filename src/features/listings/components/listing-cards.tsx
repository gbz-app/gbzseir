import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Banknote, Clock, MapPin, Play, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { districtBySlug, districtName } from "@/config/districts";
import { routes } from "@/core/routes";
import { initials } from "@/core/format";
import { DemoBadge } from "@/components/shared/badges";
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

/** Round company logo, or the initials on a soft circle. */
export function CompanyLogo({ name, logoUrl, className }: { name: string | null | undefined; logoUrl: string | null | undefined; className?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" loading="lazy" decoding="async" className={cn("size-12 shrink-0 rounded-full bg-muted object-cover", className)} />
    );
  }
  return (
    <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-primary", className)}>
      {initials(name)}
    </span>
  );
}

/** Small tag on a card photo ("İşletme", "Sıfır"). */
function PhotoTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>{children}</span>;
}

/** "Video" chip: the listing has a video. */
function VideoTag() {
  return (
    <PhotoTag className="inline-flex items-center gap-0.5 bg-black/65 text-white">
      <Play className="size-2.5 fill-current" aria-hidden />
      Video
    </PhotoTag>
  );
}

/** 2. el card of the two-column grid: white card, rounded photo, bold price, title, district + time, heart. */
export function ClassifiedCard({
  item,
  headingLevel: H = "h3",
  className,
  eager,
}: {
  item: ListingCardData;
  headingLevel?: HeadingLevel;
  className?: string;
  /** Load the photo eagerly (first cards of the list). */
  eager?: boolean;
}) {
  const condition = optionLabel(CONDITIONS, item.condition);
  const tag = item.isBusiness ? (
    <PhotoTag className="bg-black/65 text-white">İşletme</PhotoTag>
  ) : item.condition === "sifir" ? (
    <PhotoTag className="bg-success text-success-foreground">{condition}</PhotoTag>
  ) : null;
  return (
    <li className={cn("relative", className)}>
      <Link
        href={routes.listings.classified(item.id)}
        className="group flex h-full flex-col rounded-3xl bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-chip bg-muted">
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover.thumbUrl ?? item.cover.url}
              alt=""
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <ListingPlaceholder icon={item.categoryIcon} />
          )}
          {item.isDemo || tag || item.hasVideo ? (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1">
              {item.isDemo ? <DemoBadge label="Örnek" className="h-5 px-1.5 text-[11px]" /> : null}
              {tag}
              {item.hasVideo ? <VideoTag /> : null}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-1.5 pt-2.5 pb-1">
          <p className="text-[17px] leading-tight font-bold tabular-nums">{listingPriceText(item.price)}</p>
          <H className="mt-1 line-clamp-2 text-sm leading-snug font-medium">{item.title}</H>
          <p className="mt-auto flex min-w-0 items-center gap-1 pt-2 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{districtName(item.districtId, CITY.province)}</span>
            <span aria-hidden>·</span>
            <RelativeTime date={item.postedAt} className="shrink-0" />
          </p>
        </div>
      </Link>
      {/* "ghost" + own colours: the "overlay" variant's shadow-soft survives twMerge next to shadow-none. */}
      <ListingFavoriteButton
        listingId={item.id}
        className="absolute top-3 right-3 size-9 bg-white/90 text-foreground backdrop-blur hover:bg-white dark:bg-black/60 dark:text-white dark:hover:bg-black/70"
      />
    </li>
  );
}

/** Compact 2. el card for horizontal rails. */
export function ClassifiedRailCard({ item }: { item: ListingCardData }) {
  const place = districtBySlug(item.districtId)?.name;
  return (
    <li className="w-[9.5rem] shrink-0 snap-start">
      <Link
        href={routes.listings.classified(item.id)}
        className="group flex h-full flex-col rounded-3xl bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-square overflow-hidden rounded-chip bg-muted">
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.cover.thumbUrl ?? item.cover.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <ListingPlaceholder icon={item.categoryIcon} iconClassName="size-9" />
          )}
          {item.isDemo || item.hasVideo ? (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1">
              {item.isDemo ? <DemoBadge label="Örnek" className="h-5 px-1.5 text-[11px]" /> : null}
              {item.hasVideo ? <VideoTag /> : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col px-1 pt-2 pb-1">
          <p className="text-[15px] leading-tight font-bold tabular-nums">{listingPriceText(item.price)}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[13px] leading-snug font-medium">{item.title}</h3>
          {place ? <p className="mt-auto truncate pt-1 text-xs text-muted-foreground">{place}</p> : null}
        </div>
      </Link>
    </li>
  );
}

/** Soft chip inside a job card (place, work type, salary, benefits). */
function InfoPill({ icon: Icon, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <li className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-muted px-2.5 text-[13px] font-medium", className)}>
      {Icon ? <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </li>
  );
}

/** İş ilanı card: company logo circle, title, company, salary / place / work type chips, time and a black arrow. */
export function JobCard({ item, headingLevel: H = "h3", className }: { item: ListingCardData; headingLevel?: HeadingLevel; className?: string }) {
  const work = optionLabel(WORK_TYPES, item.workType);
  const place = [item.locationLabel, districtBySlug(item.districtId)?.name].filter(Boolean).join(" · ") || CITY.province;
  const verified = (item.business?.verification_level ?? 0) >= 1;
  const showSalary = isSalaryVisible(item.salaryMin, item.salaryMax, item.salaryHidden);
  const benefits = benefitOptions(item.benefits).slice(0, 3);
  return (
    <li className={cn("relative", className)}>
      <Link href={routes.listings.job(item.id)} className="group block rounded-3xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="flex items-start gap-3 pr-10">
          <CompanyLogo name={item.business?.name} logoUrl={item.business?.logo_url} />
          <div className="min-w-0 flex-1">
            <H className="line-clamp-2 text-base leading-snug font-semibold">{item.title}</H>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <span className="truncate">{item.business?.name ?? "İşletme"}</span>
              {verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Onaylı işletme" /> : null}
            </p>
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="İlan bilgileri">
          <InfoPill icon={Banknote} className={showSalary ? "bg-brand-soft font-semibold text-primary tabular-nums" : undefined}>
            {showSalary ? salaryText(item.salaryMin, item.salaryMax, item.salaryHidden) : "Maaş görüşülür"}
          </InfoPill>
          <InfoPill icon={MapPin}>{place}</InfoPill>
          {work ? <InfoPill icon={Clock}>{work}</InfoPill> : null}
          {benefits.map((b) => (
            <InfoPill key={b.value}>{b.label}</InfoPill>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <RelativeTime date={item.postedAt} className="text-xs text-muted-foreground" />
          {item.isDemo ? <DemoBadge label="Örnek" className="h-5 px-1.5 text-[11px]" /> : null}
          <span
            className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:rotate-45"
            aria-hidden
          >
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </Link>
      <ListingFavoriteButton listingId={item.id} className="absolute top-2 right-2" />
    </li>
  );
}
