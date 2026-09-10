"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { openInstallGuide } from "@/components/pwa/install-prompt";
import { routes } from "@/core/routes";
import { getPushState, isPushSubscribed, subscribePush } from "@/lib/push/client";
import { useIsClient } from "@/lib/use-is-client";

/**
 * "Sonuç çıkınca haber verelim" card: asks for notification permission ONLY when the button is tapped.
 * On iOS (not installed) it explains that push needs "Ana Ekrana Ekle".
 */
export function PushOptIn({ title = "Sonucu bildirimle haber verelim", className }: { title?: string; className?: string }) {
  const router = useRouter();
  const isClient = useIsClient();
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void isPushSubscribed().then((s) => active && setSubscribed(s));
    return () => {
      active = false;
    };
  }, []);

  if (!isClient || subscribed === null) return null;
  const state = getPushState();

  const enable = async () => {
    setBusy(true);
    const res = await subscribePush();
    setBusy(false);
    if (res.ok) {
      setSubscribed(true);
      toast.success("Bildirimler açıldı");
    } else if (res.reason === "ios-needs-install") {
      openInstallGuide();
    } else if (res.reason === "not-signed-in") {
      router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
    } else {
      toast.error(res.message);
    }
  };

  const box = cn("flex items-start gap-3 rounded-2xl p-4 text-sm", className);

  if (subscribed) {
    return (
      <div className={cn(box, "bg-success-soft")}>
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <p>
          <strong className="block">Bildirimler açık</strong>
          Sonuçlanınca bu cihaza bildirim göndereceğiz.
        </p>
      </div>
    );
  }

  if (state === "ios-needs-install") {
    return (
      <div className={cn(box, "flex-col bg-info-soft")}>
        <p>
          <strong className="block">{title}</strong>
          iPhone&apos;da bildirim alabilmek için önce uygulamayı ana ekrana eklemelisin.
        </p>
        <Button type="button" variant="outline" onClick={() => openInstallGuide()}>
          <Download /> Ana ekrana ekle
        </Button>
      </div>
    );
  }

  if (state === "unsupported" || state === "denied") {
    return (
      <div className={cn(box, "bg-muted/70")}>
        <BellRing className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          {state === "denied"
            ? "Bildirim izni kapalı. Tarayıcı ayarlarından açabilirsin; sonucu Bildirimler sayfasından da görebilirsin."
            : "Bu tarayıcı bildirimleri desteklemiyor. Sonucu Bildirimler sayfasından takip edebilirsin."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn(box, "flex-col bg-brand-soft")}>
      <p>
        <strong className="block">{title}</strong>
        <span className="text-muted-foreground">Bildirimleri açarsan sonuçlanır sonuçlanmaz haber veririz.</span>
      </p>
      <Button type="button" onClick={enable} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
        Bildirimleri aç
      </Button>
    </div>
  );
}
