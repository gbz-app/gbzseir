import { Skeleton } from "@/components/ui/skeleton";
import { HeaderDetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";
import { STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";

/** Same header, layout and bottom bar (Yol tarifi) as the cami page. */
export default function Loading() {
  return (
    <HeaderDetailSkeleton
      title="Cami"
      backHref={routes.nearby.root("cami")}
      className={STICKY_BAR_SPACE}
      footer={
        <StickyActionBar>
          <Skeleton aria-hidden className="h-12 rounded-full motion-reduce:animate-none" />
        </StickyActionBar>
      }
    />
  );
}
