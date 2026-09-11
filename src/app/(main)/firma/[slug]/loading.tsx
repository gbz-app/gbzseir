import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/** Mirrors the firm page's first paint (full-bleed hero, overlapping sheet, bottom bar): no header that flashes away. */
export default function Loading() {
  return <DetailSkeleton variant="firm" backHref={routes.businesses.root()} />;
}
