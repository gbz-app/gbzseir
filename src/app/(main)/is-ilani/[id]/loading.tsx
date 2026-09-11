import { DetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";

/** Mirrors the job ad's first paint (purple band, logo notch, sheet, heart + CTA bar). */
export default function Loading() {
  return <DetailSkeleton variant="job" backHref={routes.listings.jobs()} />;
}
