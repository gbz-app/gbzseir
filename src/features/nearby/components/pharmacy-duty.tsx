"use client";

import { Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeDutyWindow, isDutyActive } from "@/core/duty";
import { DemoBadge, DutyBadge } from "@/components/shared/badges";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL } from "../config";
import { useNow } from "../lib/use-now";
import type { DutyMode, PharmacyDuty } from "../types";
import { DetailSection } from "./detail-parts";

/** "Şu an nöbetçi" badge (evaluated at render time on the client); demo mode or a sample row also gets "Örnek veri". */
export function PharmacyDutyBadges({ duties, serverNow, mode }: { duties: PharmacyDuty[]; serverNow: number; mode: DutyMode }) {
  const now = useNow(serverNow);
  const active = duties.find((d) => isDutyActive(d.duty_start, d.duty_end, now));
  if (!active) return null;
  return (
    <>
      <DutyBadge label="Şu an nöbetçi" />
      {mode === "demo" || active.source === "demo" ? <DemoBadge /> : null}
    </>
  );
}

/** Upcoming duty windows of a pharmacy. Expired windows are never shown; sample data is labelled (like the duty list). */
export function PharmacyDutySchedule({ duties, serverNow, mode }: { duties: PharmacyDuty[]; serverNow: number; mode: DutyMode }) {
  const now = useNow(serverNow);
  const upcoming = duties.filter((d) => new Date(d.duty_end).getTime() > now).slice(0, 4);
  const demo = upcoming.length > 0 && (mode === "demo" || upcoming.some((d) => d.source === "demo"));

  return (
    <DetailSection title="Nöbet günleri" action={demo ? <DemoBadge /> : null}>
      {mode === "off" ? (
        <p className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
          Nöbet günlerini şu an gösteremiyoruz. Güncel liste için{" "}
          <a href={ECZACI_ODASI_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
            {ECZACI_ODASI_NAME}
          </a>
          &apos;nın sitesine bakabilirsin.
        </p>
      ) : upcoming.length === 0 ? (
        <p className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">Önümüzdeki günlerde kayıtlı nöbeti görünmüyor.</p>
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-card bg-card">
            {upcoming.map((d) => {
              const active = isDutyActive(d.duty_start, d.duty_end, now);
              return (
                <li key={d.id} className={cn("flex min-h-12 items-center gap-3 px-4 py-2.5", active && "bg-red-50 dark:bg-red-500/10")}>
                  <Clock3 className={cn("size-4 shrink-0", active ? "text-red-600 dark:text-red-400" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1 text-sm font-medium">{describeDutyWindow({ start: d.duty_start, end: d.duty_end }, now)}</span>
                  {active ? <DutyBadge label="Şu an" /> : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DetailSection>
  );
}
