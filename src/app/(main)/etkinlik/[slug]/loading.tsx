import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/**
 * Mirrors the event page's first paint: DetailHero with the "⋯" + share buttons, the sheet with the category chip,
 * title, four icon rows and the text, and the bottom bar (CTA + round "Takvime ekle" + round directions).
 */
export default function Loading() {
  return <DetailSkeleton variant="event" backHref={routes.events.root()} />;
}
