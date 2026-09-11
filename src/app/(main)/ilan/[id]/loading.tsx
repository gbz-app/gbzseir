import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/** Mirrors the 2. el listing's first paint (photo hero, overlapping sheet, price + CTA bar). */
export default function Loading() {
  return <DetailSkeleton variant="classified" backHref={routes.listings.classifieds()} />;
}
