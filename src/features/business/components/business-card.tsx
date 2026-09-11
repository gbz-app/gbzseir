import Link from "next/link";
import { ChevronRight, TreePalm } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { DemoBadge, VerifiedBadge } from "@/components/shared/badges";
import { districtBySlug } from "@/config/districts";
import { isOnVacation } from "../lib/hours";
import { BusinessLogo } from "./business-logo";
import { RatingInline } from "./rating";

export type BusinessRowData = {
  slug: string;
  name: string;
  logo_url: string | null;
  category_label: string | null;
  rating_avg: number;
  rating_count: number;
  verification_level: number;
  vacation_mode?: boolean;
  /** Tatil modu return date (the vacation is over from then on). */
  vacation_until?: string | null;
  /** public.districts id (config/districts.ts); its name is shown after the category. */
  district_id?: string | null;
  /** Sample (seed) business: small "Örnek" chip. */
  is_demo?: boolean;
};

/** Directory row card: logo, name + Onaylı, rating, Tatilde, category · district, optional distance. Server-safe. */
export function BusinessRow({
  b,
  distanceLabel,
  now,
  className,
}: {
  b: BusinessRowData;
  distanceLabel?: string | null;
  /** Client clock for the tatil check; null before mount (only the raw flag is used), omitted = current time. */
  now?: Date | null;
  className?: string;
}) {
  const meta = [b.category_label, districtBySlug(b.district_id)?.name].filter(Boolean).join(" · ");
  const vacation = now === null ? !!b.vacation_mode : isOnVacation(b, now);
  return (
    <Link
      href={routes.businesses.detail(b.slug)}
      className={cn(
        "group flex items-center gap-3 rounded-2xl bg-card p-3 transition-[transform,background-color] outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
        className,
      )}
    >
      <BusinessLogo name={b.name} url={b.logo_url} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[15px] leading-tight font-bold">{b.name}</p>
          {b.verification_level >= 1 ? <VerifiedBadge className="h-5 shrink-0 px-1.5 text-[11px]" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <RatingInline avg={b.rating_avg} count={b.rating_count} />
          {vacation ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-highlight-foreground dark:text-highlight">
              <TreePalm className="size-3.5" aria-hidden /> Tatilde
            </span>
          ) : null}
          {b.is_demo ? <DemoBadge label="Örnek" className="h-5 px-1.5 text-[11px]" /> : null}
        </div>
        {meta ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {distanceLabel ? <span className="text-xs font-semibold text-primary tabular-nums">{distanceLabel}</span> : null}
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
