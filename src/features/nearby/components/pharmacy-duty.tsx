"use client";

import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeDutyWindow, isDutyActive } from "@/core/duty";
import { DutyBadge } from "@/components/shared/badges";
import { useNow } from "../lib/use-now";
import type { PharmacyDuty } from "../types";
import { DetailSection } from "./detail-parts";

/** "Şu an nöbetçi" badge (evaluated at render time on the client). */
export function PharmacyDutyBadges({ duties, serverNow }: { duties: PharmacyDuty[]; serverNow: number }) {
  const now = useNow(serverNow);
  const active = duties.find((d) => isDutyActive(d.duty_start, d.duty_end, now));
  if (!active) return null;
  return (
    <>
      <DutyBadge label="Şu an nöbetçi" />
    </>
  );
}

/** Upcoming duty windows of a pharmacy. Expired windows are never shown. */
export function PharmacyDutySchedule({ duties, serverNow }: { duties: PharmacyDuty[]; serverNow: number }) {
  const now = useNow(serverNow);
  const upcoming = duties.filter((d) => new Date(d.duty_end).getTime() > now).slice(0, 4);

  return (
    <DetailSection title="Nöbet günleri">
      {upcoming.length === 0 ? (
        <p className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">Önümüzdeki günlerde kayıtlı nöbeti görünmüyor.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
          {upcoming.map((d) => {
            const active = isDutyActive(d.duty_start, d.duty_end, now);
            return (
              <li key={d.id} className={cn("flex min-h-12 items-center gap-3 px-4 py-2.5", active && "bg-highlight-soft/60")}>
                <Clock3 className={cn("size-4 shrink-0", active ? "text-highlight" : "text-muted-foreground")} aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-medium">{describeDutyWindow({ start: d.duty_start, end: d.duty_end }, now)}</span>
                {active ? <DutyBadge label="Şu an" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </DetailSection>
  );
}
