"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Palmtree, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDaysToKey, istanbulDateKey, istanbulDateTime } from "@/core/time";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { refreshMyBusinessPages } from "../actions";
import { vacationReturnLabel } from "../lib/hours";

type VacationPatch = Pick<Database["public"]["Tables"]["businesses"]["Update"], "vacation_mode" | "vacation_until">;

/** Delay before a picked return date is saved (desktop date inputs fire on every typed segment). */
const SAVE_DELAY_MS = 800;

/**
 * Tatil modu: the business stays listed but shows "Tatilde" instead of its open hours everywhere (firm page, QR menu,
 * cards, search); service firms also get no new leads. Optional "Dönüş tarihi" (businesses.vacation_until = 00:00
 * Istanbul of that day): the vacation ends by itself then (daily DB job + the write trigger).
 */
export function VacationToggle({
  businessId,
  initial,
  initialUntil = null,
  isService = false,
}: {
  businessId: string;
  initial: boolean;
  initialUntil?: string | null;
  /** Service firms: the copy also mentions leads. */
  isService?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [dateKey, setDateKey] = React.useState(() => (initialUntil ? istanbulDateKey(initialUntil) : ""));
  const [savedKey, setSavedKey] = React.useState(dateKey);
  // Tomorrow .. one year ahead (Istanbul days).
  const [range] = React.useState(() => {
    const today = istanbulDateKey();
    return { min: addDaysToKey(today, 1), max: addDaysToKey(today, 365) };
  });
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const save = async (patch: VacationPatch): Promise<boolean> => {
    const { error } = await createClient().from("businesses").update(patch).eq("id", businessId);
    if (error) return false;
    await refreshMyBusinessPages().catch(() => undefined);
    router.refresh();
    return true;
  };

  const change = async (next: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    setBusy(true);
    setOn(next);
    const ok = await save(next ? { vacation_mode: true } : { vacation_mode: false, vacation_until: null });
    setBusy(false);
    if (!ok) {
      setOn(!next);
      toast.error("Tatil modu değiştirilemedi. Lütfen tekrar dene.");
      return;
    }
    if (!next) {
      setDateKey("");
      setSavedKey("");
    }
    if (next) toast.success(isService ? "Tatil modu açıldı. Yeni talep gelmeyecek." : "Tatil modu açıldı. İşletmen 'Tatilde' görünüyor.");
    else toast.success(isService ? "Tatil modu kapandı. Talepler tekrar gelecek." : "Tatil modu kapandı.");
  };

  const saveDate = async (key: string) => {
    if (key === savedKey) return;
    if (key && (key < range.min || key > range.max)) {
      toast.error("Dönüş tarihini yarından itibaren bir yıl içinde seç.");
      return;
    }
    setBusy(true);
    const ok = await save({ vacation_until: key ? istanbulDateTime(key).toISOString() : null });
    setBusy(false);
    if (!ok) {
      setDateKey(savedKey);
      toast.error("Dönüş tarihi kaydedilemedi. Lütfen tekrar dene.");
      return;
    }
    setSavedKey(key);
    toast.success(key ? `Dönüş tarihi kaydedildi: ${vacationReturnLabel(istanbulDateTime(key).toISOString())}` : "Dönüş tarihi kaldırıldı.");
  };

  const pickDate = (key: string) => {
    setDateKey(key);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveDate(key), SAVE_DELAY_MS);
  };

  const clearDate = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setDateKey("");
    void saveDate("");
  };

  const effect = `Tatil modunda işletmen 'Tatilde' görünür, açık saatlerin gizlenir${isService ? ", yeni hizmet talebi almazsın" : ""}.`;
  const backLabel = savedKey ? vacationReturnLabel(istanbulDateTime(savedKey).toISOString()) : null;

  return (
    <div>
      <label htmlFor="tatil-modu" className="flex min-h-14 items-center gap-3 px-4 py-3">
        <Palmtree className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Tatil modu</span>
          <span className="block text-xs leading-snug text-muted-foreground">{effect}</span>
        </span>
        <Switch id="tatil-modu" checked={on} disabled={busy} onCheckedChange={change} />
      </label>

      {on ? (
        <div className="px-4 pb-4 pl-12">
          <Label htmlFor="tatil-donus" className="text-xs font-semibold text-muted-foreground">
            Dönüş tarihi (isteğe bağlı)
          </Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="tatil-donus"
              type="date"
              value={dateKey}
              min={range.min}
              max={range.max}
              disabled={busy}
              onChange={(e) => pickDate(e.target.value)}
              className="h-11 min-w-0 flex-1"
            />
            {dateKey ? (
              <Button type="button" variant="ghost" size="icon" onClick={clearDate} disabled={busy} aria-label="Dönüş tarihini kaldır" className="size-11 shrink-0">
                <X />
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {backLabel ? `Tatil modu ${backLabel} günü kendiliğinden kapanır.` : "Tarih seçersen tatil modu o gün kendiliğinden kapanır."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
