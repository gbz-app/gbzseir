import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/**
 * Mirrors the place page's first paint: full-height photo hero (DetailHero default, like /etkinlik), the overlapping
 * sheet with a category chip, title and icon rows, and the bottom bar. No header that flashes away.
 */
export default function Loading() {
  return <DetailSkeleton variant="event" backHref={routes.nearby.places()} />;
}
