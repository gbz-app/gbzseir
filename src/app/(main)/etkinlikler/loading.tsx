import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton block; stays still when the user prefers reduced motion. */
function Bone({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("motion-reduce:animate-none", className)} />;
}

/** Mirrors EventsExplorer's first paint: ExploreHeader with the "Etkinlik oluştur" pill, search, two chip rails, cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-32" aria-busy="true">
      <div className="pt-safe">
        <div className="flex h-(--topbar-h) items-center justify-between gap-2">
          <Bone className="size-11 rounded-full" />
          <Bone className="h-11 w-40 rounded-full" />
        </div>
        <Bone className="mt-1 h-8 w-40 rounded-xl" />
        <Bone className="mt-2 h-4 w-60 rounded-md" />
      </div>
      <Bone className="h-12 w-full rounded-full" />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 overflow-hidden py-0.5">
          {["w-16", "w-24", "w-24", "w-28"].map((w, i) => (
            <Bone key={i} className={cn("h-10 shrink-0 rounded-full", w)} />
          ))}
        </div>
        <div className="flex gap-2 overflow-hidden py-0.5">
          {["w-16", "w-28", "w-24", "w-20"].map((w, i) => (
            <Bone key={i} className={cn("h-9 shrink-0 rounded-full", w)} />
          ))}
        </div>
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
