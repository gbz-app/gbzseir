"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Palmtree } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { refreshMyBusinessPages } from "../actions";

/** Tatil modu: the business stays listed but gets no new service leads and shows "Tatilde". */
export function VacationToggle({ businessId, initial }: { businessId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  const change = async (next: boolean) => {
    setBusy(true);
    setOn(next);
    const { error } = await createClient().from("businesses").update({ vacation_mode: next }).eq("id", businessId);
    if (error) {
      setOn(!next);
      setBusy(false);
      toast.error("Tatil modu değiştirilemedi. Lütfen tekrar dene.");
      return;
    }
    await refreshMyBusinessPages().catch(() => undefined);
    setBusy(false);
    toast.success(next ? "Tatil modu açıldı. Yeni talep gelmeyecek." : "Tatil modu kapandı. Talepler tekrar gelecek.");
    router.refresh();
  };

  return (
    <label htmlFor="tatil-modu" className="flex min-h-14 items-center gap-3 px-4 py-3">
      <Palmtree className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">Tatil modu</span>
        <span className="block text-xs text-muted-foreground">{on ? "Açık: yeni talep almıyorsun" : "Kapalı: talepler geliyor"}</span>
      </span>
      <Switch id="tatil-modu" checked={on} disabled={busy} onCheckedChange={change} />
    </label>
  );
}
