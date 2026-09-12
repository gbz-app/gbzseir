import Link from "next/link";
import { Clock3, MapPin, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeDutyWindow, isDutyActive } from "@/core/duty";
import { formatDistance } from "@/core/geo";
import { Button } from "@/components/ui/button";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DemoBadge, DutyBadge, OpenStatusBadge, VerifiedBadge } from "@/components/shared/badges";
import { openStatus } from "../lib/hours";
import type { NearbyItem } from "../types";
import { KindIcon } from "./kind-icon";

/** Black "Ara" (same look as the firm page's call bar). */
const BLACK_CALL = "bg-foreground text-background shadow-none hover:bg-foreground/90";

export type NearbyCardProps = {
  item: NearbyItem;
  /** Current time (ms) for duty / open badges. */
  now: number;
  showDistance: boolean;
  selected?: boolean;
  /** Duty data is sample data: on-duty cards also get the "Örnek veri" badge. */
  demoDuty?: boolean;
  onShowOnMap?: (item: NearbyItem) => void;
};

const MAX_LINES = 6;

/**
 * List card on /yakinimda: icon, name, distance, address, status badges, Ara + Yol tarifi + Haritada göster. Taxi stands
 * and pharmacies (the taxi layout): a black "Ara" that stays, passive with a crossed-out phone, when there is no number.
 */
export function NearbyCard({ item, now, showDistance, selected, demoDuty, onShowOnMap }: NearbyCardProps) {
  const onDuty = !!item.duty && isDutyActive(item.duty.start, item.duty.end, now);
  const status = item.kind === "business" ? openStatus(item.hours, now, item.vacation) : null;
  const lines = item.lines ?? [];
  const hasBadges = onDuty || !!status || !!item.verified || lines.length > 0;
  const blackCall = item.kind === "taxi" || item.kind === "pharmacy" || item.kind === "duty";

  return (
    <article
      id={`yakin-${item.id}`}
      className={cn("relative rounded-card bg-card p-4 transition-shadow", selected && "ring-2 ring-primary")}
    >
      <div className="flex items-start gap-3">
        <KindIcon kind={item.kind === "pharmacy" && onDuty ? "duty" : item.kind} icon={item.icon} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 text-base leading-snug font-semibold break-words">
              <Link
                href={item.href}
                className="rounded-md outline-none after:absolute after:inset-0 after:rounded-card focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {item.name}
              </Link>
            </h3>
            {showDistance && item.distance !== null ? (
              <span className="shrink-0 pt-0.5 text-sm font-bold text-primary tabular-nums">{formatDistance(item.distance)}</span>
            ) : null}
          </div>
          {item.subtitle ? <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{item.subtitle}</p> : null}
          {item.address ? <p className="mt-1 line-clamp-1 text-[13px] leading-snug">{item.address}</p> : null}
          {item.kind === "duty" && item.duty && onDuty ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
              <Clock3 className="size-3.5 shrink-0" aria-hidden />
              {describeDutyWindow(item.duty, now)}
            </p>
          ) : null}
          {hasBadges ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {onDuty ? <DutyBadge /> : null}
              {onDuty && demoDuty ? <DemoBadge /> : null}
              {status ? <OpenStatusBadge open={status.open} openLabel={status.label} closedLabel={status.label} /> : null}
              {item.verified ? <VerifiedBadge /> : null}
              {lines.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1" aria-label={`Hatlar: ${lines.join(", ")}`}>
                  {lines.slice(0, MAX_LINES).map((l) => (
                    <span
                      key={l}
                      className="inline-flex h-6 items-center rounded-md bg-sky-100 px-1.5 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                    >
                      {l}
                    </span>
                  ))}
                  {lines.length > MAX_LINES ? <span className="text-xs font-semibold text-muted-foreground">+{lines.length - MAX_LINES}</span> : null}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {item.phone || blackCall || !item.noPin ? (
      <div className="relative z-10 mt-3.5 flex gap-2">
        {item.phone ? (
          <CallButton
            phone={item.phone}
            subjectType={item.subjectType}
            subjectId={item.id}
            variant={blackCall ? "default" : "success"}
            className={cn("flex-1 rounded-full", blackCall && BLACK_CALL)}
          />
        ) : blackCall ? (
          // Same card as the others; without a number the call button stays, passive, with a crossed-out phone.
          <Button type="button" disabled aria-label="Ara (telefon numarası yok)" className={cn("flex-1 rounded-full", BLACK_CALL)}>
            <PhoneOff aria-hidden /> Ara
          </Button>
        ) : null}
        {/* A row without a map location (guide lists) has no route and no pin to show. */}
        {item.noPin ? null : (
          <DirectionsButton
            lat={item.lat}
            lng={item.lng}
            name={item.name}
            subjectType={item.subjectType}
            subjectId={item.id}
            className="flex-1 rounded-full border-0 bg-muted hover:bg-muted/70"
          />
        )}
        {onShowOnMap && !item.noPin ? (
          <Button type="button" variant="secondary" size="icon" className="rounded-full" aria-label={`${item.name}: haritada göster`} onClick={() => onShowOnMap(item)}>
            <MapPin />
          </Button>
        ) : null}
      </div>
      ) : null}
    </article>
  );
}
