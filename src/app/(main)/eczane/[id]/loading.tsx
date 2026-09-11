import { Skeleton } from "@/components/ui/skeleton";
import { HeaderDetailSkeleton } from "@/components/shared/detail-skeleton";
import { routes } from "@/core/routes";
import { STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";

/** Same header, layout and bottom bar (Ara + Yol tarifi) as the eczane page. */
export default function Loading() {
  return (
    <HeaderDetailSkeleton
      title="Eczane"
      backHref={routes.nearby.root("eczane")}
      className={STICKY_BAR_SPACE}
      footer={
        <StickyActionBar>
          <Skeleton aria-hidden className="h-12 rounded-full motion-reduce:animate-none" />
          <Skeleton aria-hidden className="h-12 rounded-full motion-reduce:animate-none" />
        </StickyActionBar>
      }
    />
  );
}
