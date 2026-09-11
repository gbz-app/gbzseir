"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCircle2, Loader2, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { openInstallGuide } from "@/components/pwa/install-prompt";
import { routes } from "@/core/routes";
import { getPushState, isPushSubscribed, subscribePush } from "@/lib/push/client";
import { readString, writeString } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";

/** "Şimdi değil" hides the card on this device for this long (per dismissKey). */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const dismissStorageKey = (key: string) => `gebzem.pushPrompt.${key}.dismissedAt`;

function isSnoozed(key: string): boolean {
  const at = Number(readString(dismissStorageKey(key)));
  return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
}

type Props = {
  title?: string;
  text?: string;
  /** Cards sharing a key share the "Şimdi değil" snooze. */
  dismissKey?: string;
  className?: string;
};

/**
 * Soft push opt-in card: asks for notification permission ONLY when the button is tapped.
 * Renders nothing when push is unsupported, permission is denied, this device is already subscribed or the card was
 * dismissed recently. On iOS (not installed) it explains that push needs "Ana Ekrana Ekle".
 */
export function PushOptIn({
  title = "Sonucu bildirimle haber verelim",
  text = "Bildirimleri açarsan sonuçlanır sonuçlanmaz haber veririz.",
  dismissKey = "default",
  className,
}: Props) {
  const router = useRouter();
  const isClient = useIsClient();
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [justEnabled, setJustEnabled] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() => isSnoozed(dismissKey));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    isPushSubscribed()
      .then((s) => active && setSubscribed(s))
      .catch(() => active && setSubscribed(false));
    return () => {
      active = false;
    };
  }, []);

  if (!isClient) return null;
  const box = cn("flex gap-3 rounded-2xl bg-card p-4", className);

  if (justEnabled) {
    return (
      <div className={cn(box, "items-center bg-success-soft text-sm")}>
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
        <p>
          <strong className="block">Bildirimler açık</strong>
          Bu cihaza bildirim göndereceğiz.
        </p>
      </div>
    );
  }

  const state = getPushState();
  if (dismissed || subscribed === null || subscribed || state === "unsupported" || state === "denied") return null;

  const dismiss = () => {
    writeString(dismissStorageKey(dismissKey), String(Date.now()));
    setDismissed(true);
  };

  const enable = async () => {
    setBusy(true);
    const res = await subscribePush();
    setBusy(false);
    if (res.ok) {
      setJustEnabled(true);
      toast.success("Bildirimler açıldı");
    } else if (res.reason === "ios-needs-install") {
      openInstallGuide();
    } else if (res.reason === "not-signed-in") {
      router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
    } else {
      toast.error(res.message);
    }
  };

  const ios = state === "ios-needs-install";
  const Icon = ios ? SquarePlus : Bell;

  return (
    <section className={box}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
          {ios ? "iPhone'da bildirim alabilmek için önce uygulamayı ana ekrana eklemelisin." : text}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ios ? (
            <Button type="button" variant="outline" onClick={() => openInstallGuide()}>
              Ana ekrana ekle
            </Button>
          ) : (
            <Button type="button" onClick={enable} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
              Bildirimleri aç
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={dismiss}>
            Şimdi değil
          </Button>
        </div>
      </div>
    </section>
  );
}
