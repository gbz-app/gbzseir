"use client";

import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DAY_KEYS, DAY_LABELS, type DayKey, type WorkingHours } from "../../lib/hours";

const WEEKDAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

/** Per-day open/close times or "Kapalı"; windows ending after midnight are allowed (e.g. 18:00 - 02:00). */
export function HoursEditor({ value, onChange, id }: { value: WorkingHours; onChange: (v: WorkingHours) => void; id?: string }) {
  const set = (key: DayKey, patch: Partial<{ open: string; close: string }> | null) => {
    const current = value[key] ?? { open: "09:00", close: "18:00" };
    onChange({ ...value, [key]: patch === null ? null : { ...current, ...patch } });
  };

  const copyFromMonday = (targets: DayKey[]) => {
    const mon = value.mon;
    const next = { ...value };
    for (const k of targets) next[k] = mon ? { ...mon } : null;
    onChange(next);
  };

  return (
    <div id={id} className="flex flex-col gap-3">
      <ul className="divide-y overflow-hidden rounded-2xl bg-card">
        {DAY_KEYS.map((key) => {
          const day = value[key];
          const open = day !== null;
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
              <div className="flex min-w-[8.5rem] flex-1 items-center gap-3">
                <Switch
                  checked={open}
                  onCheckedChange={(c) => set(key, c ? {} : null)}
                  aria-label={`${DAY_LABELS[key]} açık`}
                />
                <span className={cn("text-[15px] font-semibold", !open && "text-muted-foreground")}>{DAY_LABELS[key]}</span>
              </div>
              {open ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    step={900}
                    value={day.open}
                    onChange={(e) => e.target.value && set(key, { open: e.target.value })}
                    aria-label={`${DAY_LABELS[key]} açılış saati`}
                    className="h-11 w-[6.5rem] rounded-xl border border-input bg-background px-2.5 text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                  <span className="text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <input
                    type="time"
                    step={900}
                    value={day.close}
                    onChange={(e) => e.target.value && set(key, { close: e.target.value })}
                    aria-label={`${DAY_LABELS[key]} kapanış saati`}
                    className="h-11 w-[6.5rem] rounded-xl border border-input bg-background px-2.5 text-center text-base font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </div>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Kapalı</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copyFromMonday(WEEKDAYS.slice(1))}>
          <Copy /> Pazartesiyi hafta içine uygula
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copyFromMonday(DAY_KEYS.slice(1) as DayKey[])}>
          <Copy /> Tüm günlere uygula
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Gece yarısını geçen saatler (örn. 18:00 – 02:00) ertesi güne sayılır.</p>
    </div>
  );
}
