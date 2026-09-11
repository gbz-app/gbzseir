import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/** Mirrors the /kurum page's first paint (firm-height hero, overlapping sheet, Ara + Yol tarifi bar). */
export default function Loading() {
  return <DetailSkeleton variant="firm" backHref={routes.guide.root()} />;
}
