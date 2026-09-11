import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton block; stays still when the user prefers reduced motion. */
function Bone({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("motion-reduce:animate-none", className)} />;
}

/**
 * Mirrors /etkinlikler/gecmis: ExploreHeader (back button, title, subtitle), the count line and the event cards.
 * Without it the parent /etkinlikler skeleton (search, chip rails, "Etkinlik oluştur") would show here.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-10" aria-busy="true">
      <div className="pt-safe">
        <div className="flex h-(--topbar-h) items-center">
          <Bone className="size-11 rounded-full" />
        </div>
        <Bone className="mt-1 h-8 w-52 rounded-xl" />
        <Bone className="mt-2 h-4 w-48 rounded-md" />
      </div>
      <Bone className="h-4 w-20 rounded-md" />
      <Bone className="aspect-[5/4] max-h-[20.8rem] w-full rounded-[1.75rem]" />
      <Bone className="aspect-[5/4] max-h-[20.8rem] w-full rounded-[1.75rem]" />
      <p role="status" className="sr-only">
        Yükleniyor…
      </p>
    </div>
  );
}
