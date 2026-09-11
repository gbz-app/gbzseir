import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton block; stays still when the user prefers reduced motion. */
function Bone({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("motion-reduce:animate-none", className)} />;
}

/** Card skeleton: white surface, rounded photo and three text lines (like EventCard). */
function CardBone() {
  return (
    <div className="rounded-media bg-card p-2" aria-hidden>
      <Bone className="aspect-[16/10] w-full rounded-card" />
      <div className="px-2.5 pt-3 pb-2">
        <Bone className="h-3.5 w-28 rounded-md" />
        <Bone className="mt-2.5 h-5 w-4/5 rounded-md" />
        <Bone className="mt-2.5 h-3.5 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

/** Mirrors EventsExplorer's first paint: ExploreHeader with the "Etkinlik oluştur" pill, search, two chip rails, cards. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 px-4 pb-32" aria-busy="true">
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
            <Bone key={i} className={cn("h-9 shrink-0 rounded-full", w)} />
          ))}
        </div>
        <div className="flex gap-2 overflow-hidden py-0.5">
          {["w-16", "w-28", "w-24", "w-20"].map((w, i) => (
            <Bone key={i} className={cn("h-9 shrink-0 rounded-full", w)} />
          ))}
        </div>
      </div>
      <Bone className="h-4 w-20 rounded-md" />
      <CardBone />
      <CardBone />
      <p role="status" className="sr-only">
        Yükleniyor…
      </p>
    </div>
  );
}
