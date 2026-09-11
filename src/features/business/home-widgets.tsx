import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { VerifiedBadge } from "@/components/shared/badges";
import { routes } from "@/core/routes";
import { listApprovedBusinesses, type DirectoryBusiness } from "./lib/queries";
import { isOnVacation } from "./lib/hours";
import { BusinessLogo } from "./components/business-logo";
import { RatingInline } from "./components/rating";
import { VacationBadge } from "./components/vacation-badge";

/** Rating (weighted by review count) + profile completeness + verification; businesses on vacation drop back. */
function featuredScore(b: DirectoryBusiness): number {
  const rating = b.rating_count > 0 ? b.rating_avg * Math.min(1, b.rating_count / 3) : 0; // 0..5
  const completeness =
    (b.logo_url ? 1 : 0) + (b.cover_url ? 1 : 0) + Math.min(b.photo_count, 3) / 3 + (b.has_description ? 1 : 0) + (b.has_hours ? 1 : 0); // 0..5
  return rating * 0.6 + completeness * 0.4 + (b.verification_level >= 2 ? 0.3 : 0) - (isOnVacation(b) ? 1 : 0);
}

export type FeaturedBusinessesRailProps = {
  /** Number of cards (default 10). */
  limit?: number;
  title?: string;
};

/**
 * HOME WIDGET (server component): horizontal rail of approved businesses with the best rating / most complete
 * profiles. Self-contained data fetching (public, cookie-less); renders nothing when there is no data or on error.
 */
export async function FeaturedBusinessesRail({ limit = 10, title = "Öne çıkan işletmeler" }: FeaturedBusinessesRailProps = {}) {
  let list: DirectoryBusiness[];
  try {
    list = await listApprovedBusinesses();
  } catch {
    return null;
  }
  const top = [...list].sort((a, b) => featuredScore(b) - featuredScore(a)).slice(0, limit);
  if (top.length === 0) return null;

  return (
    <section aria-label={title}>
      <SectionHeader title={title} description="Kocaeli'nin onaylı işletmeleri" href={routes.businesses.root()} />
      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {top.map((b) => (
          <li key={b.id} className="w-[15rem] shrink-0 snap-start">
            <Link
              href={routes.businesses.detail(b.slug)}
              className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06] transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
            >
              <div className="relative aspect-[16/8] overflow-hidden bg-linear-to-br from-brand-soft to-muted">
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.cover_url} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
                ) : (
                  <Store className="absolute right-3 bottom-2 size-10 text-primary/15" aria-hidden />
                )}
                {isOnVacation(b) ? <VacationBadge className="absolute top-2 left-2" /> : null}
              </div>
              <div className="flex flex-1 flex-col px-3 pb-3">
                <BusinessLogo name={b.name} url={b.logo_url} size="md" className="-mt-7 ring-4 ring-card" />
                <div className="mt-2 flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] leading-tight font-bold">{b.name}</p>
                  {b.verification_level >= 1 ? <VerifiedBadge className="h-5 shrink-0 px-1.5 text-[11px]" /> : null}
                </div>
                <RatingInline avg={b.rating_avg} count={b.rating_count} className="mt-1" />
                {b.category_label ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{b.category_label}</p> : null}
              </div>
            </Link>
          </li>
        ))}
        <li className="w-[9rem] shrink-0 snap-start">
          <Link
            href={routes.businesses.root()}
            className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-brand-soft/40 p-3 text-center text-sm font-bold text-primary outline-none hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-card shadow-soft">
              <ArrowRight className="size-5" aria-hidden />
            </span>
            Tüm firmalar
          </Link>
        </li>
      </ul>
    </section>
  );
}
