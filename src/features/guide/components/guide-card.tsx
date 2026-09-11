import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/core/geo";
import { guideIcon } from "@/features/guide/lib/constants";
import { KIND_META } from "@/features/nearby/config";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import type { GuideEntry } from "./list-config";
import { GuidePhoto } from "./guide-photo";

/** Small green "Doğrulandı" chip: phone and address were checked against an official source. */
export function VerifiedChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full bg-success-soft px-2 text-xs font-semibold text-success", className)}>
      <BadgeCheck className="size-3.5" aria-hidden />
      Doğrulandı
    </span>
  );
}

/** Category icon of a row in its kind's colours (same as the map pins). */
export function GuideEntryIcon({ entry, size = "lg", className }: { entry: Pick<GuideEntry, "kind" | "icon">; size?: "sm" | "md" | "lg"; className?: string }) {
  return <KindIcon kind={entry.kind} icon={guideIcon(entry.icon, KIND_META[entry.kind].icon)} size={size} className={className} />;
}

/**
 * White list card of a guide row: photo or icon, name, type · mahalle, "Doğrulandı" / "Özel" chips and the distance
 * (`distanceM` from the server, else from the stored location on the client). Server-safe.
 */
export function GuideCard({ entry, distanceM, className }: { entry: GuideEntry; distanceM?: number | null; className?: string }) {
  const chips = entry.verified || entry.own === "ozel";
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-center gap-3 rounded-3xl bg-card p-3 pr-3.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60",
        className,
      )}
    >
      {entry.photo ? (
        <GuidePhoto src={entry.photo} alt="" sizes="56px" className="size-14 shrink-0 rounded-2xl" />
      ) : (
        <GuideEntryIcon entry={entry} />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{entry.name}</span>
        {entry.sub ? <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{entry.sub}</span> : null}
        {chips ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {entry.verified ? <VerifiedChip /> : null}
            {entry.own === "ozel" ? (
              <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">Özel</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {typeof distanceM === "number" ? (
          <span className="text-sm font-semibold text-primary tabular-nums">{formatDistance(distanceM)}</span>
        ) : (
          <DistanceLabel lat={entry.lat} lng={entry.lng} className="text-sm font-semibold text-primary" />
        )}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
    </Link>
  );
}
