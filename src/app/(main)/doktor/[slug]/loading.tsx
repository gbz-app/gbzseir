import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BOTTOM_DOCK_SPACE } from "@/components/shared/bottom-dock";
import { DetailActions } from "@/components/shared/detail-hero";
import { routes } from "@/core/routes";
import { DoctorTopBar } from "./doctor-top-bar";

/** Skeleton block; stays still when the user prefers reduced motion. */
function Bone({ className }: { className?: string }) {
  return <Skeleton aria-hidden className={cn("motion-reduce:animate-none", className)} />;
}

/** Mirrors the doctor page's first paint: top bar, photo circle, name, branch chip, clinic row, days card, bottom dock. */
export default function Loading() {
  return (
    <>
      <DoctorTopBar backHref={routes.doctors.list()} />
      <div aria-busy="true" className={cn("mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-2", BOTTOM_DOCK_SPACE)}>
        <div className="flex flex-col items-center px-2 pb-2">
          <Bone className="size-32 rounded-full" />
          <Bone className="mt-4 h-7 w-56 max-w-full" />
          <Bone className="mt-3 h-8 w-32 rounded-full" />
        </div>
        <div className="flex items-center gap-3 rounded-3xl bg-card p-3 pr-4">
          <Bone className="size-12 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <Bone className="h-4 w-2/3" />
            <Bone className="mt-2 h-3.5 w-1/3" />
          </div>
        </div>
        <div className="rounded-3xl bg-card p-4">
          <Bone className="h-4 w-36" />
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Bone key={i} className="h-10 rounded-full" />
            ))}
          </div>
          <Bone className="mt-3 h-4 w-32" />
        </div>
        <div className="rounded-3xl bg-card p-4">
          <Bone className="h-4 w-24" />
          <div className="mt-3 flex flex-col gap-2">
            <Bone className="h-3.5 w-full" />
            <Bone className="h-3.5 w-4/5" />
          </div>
        </div>
        <p role="status" className="sr-only">
          Yükleniyor…
        </p>
      </div>
      <DetailActions>
        <Bone className="h-14 min-w-0 flex-1 rounded-full" />
        <Bone className="size-14 shrink-0 rounded-full" />
      </DetailActions>
    </>
  );
}
