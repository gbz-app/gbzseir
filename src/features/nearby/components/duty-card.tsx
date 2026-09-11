import Link from "next/link";
import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatDistance } from "@/core/geo";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DemoBadge, DutyBadge } from "@/components/shared/badges";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL, districtLabel } from "../config";
import type { DutyRow } from "../types";
import { KindIcon } from "./kind-icon";

export type DutyCardProps = {
  row: DutyRow;
  distance: number | null;
  /** "Bugün 08:30 - Yarın 08:30". */
  windowText: string;
  /** Show the "Nöbetçi" badge (current window). */
  onDuty?: boolean;
  /** Sample (demo) duty row: shows the "Örnek veri" badge. */
  demo?: boolean;
  className?: string;
};

/** Pharmacy card for duty lists: name, district, address, window, Ara + Yol tarifi. */
export function DutyCard({ row, distance, windowText, onDuty, demo, className }: DutyCardProps) {
  const district = districtLabel(row);
  return (
    <article className={cn("relative rounded-card bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <KindIcon kind="duty" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base leading-snug font-bold">
              <Link
                href={routes.nearby.pharmacy(row.slug)}
                className="rounded-md outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {row.name}
              </Link>
            </h3>
            {distance !== null ? (
              <span className="shrink-0 pt-0.5 text-sm font-bold text-primary tabular-nums">{formatDistance(distance)}</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {onDuty ? <DutyBadge /> : null}
            {demo ? <DemoBadge /> : null}
            {district ? <span className="text-sm text-muted-foreground">{district}</span> : null}
          </div>
          {row.address ? <p className="mt-1.5 line-clamp-2 text-sm leading-snug">{row.address}</p> : null}
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-highlight-foreground dark:text-highlight">
            <Clock3 className="size-3.5 shrink-0" aria-hidden />
            {windowText}
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-3 flex gap-2">
        {row.phone ? <CallButton phone={row.phone} subjectType="poi" subjectId={row.poi_id} className="flex-1" /> : null}
        <DirectionsButton lat={row.lat} lng={row.lng} name={row.name} subjectType="poi" subjectId={row.poi_id} className="flex-1" />
      </div>
    </article>
  );
}

/** One-line "Örnek veri" band for sample duty data, with the official list link. Server-safe. */
export function DutyDemoNote({ className }: { className?: string }) {
  return (
    <DemoDataBanner compact className={className}>
      Gerçek nöbet listesi değil - resmi liste için{" "}
      <a href={ECZACI_ODASI_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
        {ECZACI_ODASI_NAME}
      </a>
      .
    </DemoDataBanner>
  );
}
