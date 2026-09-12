import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";

/** Same large-title header, layout and bottom bar (Yol tarifi, telefon) as the cami page. */
export default function Loading() {
  return (
    <>
      <HideBottomNav />
      <div className={cn("flex flex-col gap-5 px-4", STICKY_BAR_SPACE)} aria-busy="true" aria-label="Cami yükleniyor">
        <div className="pt-safe">
          <div className="flex h-(--topbar-h) items-center justify-between gap-2">
            <Skeleton aria-hidden className="size-11 rounded-full motion-reduce:animate-none" />
            <Skeleton aria-hidden className="size-11 rounded-full motion-reduce:animate-none" />
          </div>
          <Skeleton aria-hidden className="mt-1 h-9 w-3/4 rounded-xl motion-reduce:animate-none" />
          <Skeleton aria-hidden className="mt-2 h-4 w-1/3 rounded-md motion-reduce:animate-none" />
        </div>
        <Skeleton aria-hidden className="h-[15.75rem] rounded-[1.75rem] motion-reduce:animate-none" />
        <Skeleton aria-hidden className="h-64 rounded-[1.75rem] motion-reduce:animate-none" />
        <Skeleton aria-hidden className="aspect-[16/9] w-full rounded-[1.75rem] motion-reduce:animate-none" />
      </div>
      <StickyActionBar>
        <Skeleton aria-hidden className="h-13 rounded-2xl motion-reduce:animate-none" />
      </StickyActionBar>
    </>
  );
}
