import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDistance } from "@/core/geo";
import { districtLabel, poiHref } from "../config";
import type { PoiRow } from "../types";
import { DetailSection } from "./detail-parts";
import { KindIcon } from "./kind-icon";

/** "Yakındaki ..." links on detail pages (distance from the current place). Server-safe. */
export function NearbyMiniList({ title, rows, className }: { title: string; rows: PoiRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <DetailSection title={title} className={className}>
      <ul className="divide-y overflow-hidden rounded-[1.75rem] bg-card">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={poiHref(r.kind, r.slug)}
              className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
            >
              <KindIcon kind={r.kind} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.address ?? districtLabel(r) ?? ""}</span>
              </span>
              {r.distance_m !== null ? <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{formatDistance(r.distance_m)}</span> : null}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}
