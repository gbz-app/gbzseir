import Link from "next/link";
import { ChevronRight, TreePalm } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { VerifiedBadge } from "@/components/shared/badges";
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
  neighbourhood_name?: string | null;
};

/** Directory row card: logo, name + Onaylı, rating, category · neighbourhood, optional distance. Server-safe. */
export function BusinessRow({ b, distanceLabel, className }: { b: BusinessRowData; distanceLabel?: string | null; className?: string }) {
  const meta = [b.category_label, b.neighbourhood_name ? `${b.neighbourhood_name}` : null].filter(Boolean).join(" · ");
  return (
    <Link
      href={routes.businesses.detail(b.slug)}
      className={cn(
        "group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.06] transition-[transform,background-color] outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
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
          {b.vacation_mode ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-highlight-foreground dark:text-highlight">
              <TreePalm className="size-3.5" aria-hidden /> Tatilde
            </span>
          ) : null}
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
