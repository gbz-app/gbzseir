"use client";

import * as React from "react";
import { Bell, BellRing, Loader2, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getPushState, isPushSubscribed, subscribePush } from "@/lib/push/client";
import { openInstallGuide } from "@/lib/pwa/install-store";
import { useIsClient } from "@/lib/use-is-client";

/**
 * F5 soft push opt-in: "Firmalar ilgilenince haber verelim mi?". Permission is asked only on tap.
 * Hidden when push is unsupported or denied; on iOS outside the installed app it suggests "Ana Ekrana Ekle".
 */
export function PushOptInCard() {
  const isClient = useIsClient();
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    isPushSubscribed()
      .then((v) => alive && setSubscribed(v))
      .catch(() => alive && setSubscribed(false));
    return () => {
      alive = false;
    };
  }, []);

  if (!isClient || dismissed) return null;
  const state = getPushState();
  if (state === "unsupported" || state === "denied") return null;

  if (state === "ios-needs-install") {
    return (
      <section className="flex gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <SquarePlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Firmalar ilgilenince haber alalım mı?</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            iPhone&apos;da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır. Uygulamayı ekledikten sonra bildirimleri açabilirsin.
          </p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => openInstallGuide()}>
            Ana Ekrana Ekle
          </Button>
        </div>
      </section>
    );
  }

  if (subscribed === null) return null;

  if (subscribed && state === "granted") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
        <BellRing className="size-4 shrink-0" aria-hidden />
        Bildirimler açık. Firmalar ilgilenince haber vereceğiz.
      </p>
    );
  }

  const enable = async () => {
    setBusy(true);
    const res = await subscribePush();
    setBusy(false);
    if (res.ok) {
      setSubscribed(true);
      toast.success("Bildirimler açıldı");
    } else {
      toast.error(res.message);
      if (res.reason === "denied") setDismissed(true);
    }
  };

  return (
    <section className="flex gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
        <Bell className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Firmalar ilgilenince haber verelim mi?</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Bir firma talebinle ilgilendiğinde telefonuna bildirim gelsin.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={enable} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
            Evet, haber ver
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
            Şimdi değil
          </Button>
        </div>
      </div>
    </section>
  );
}
