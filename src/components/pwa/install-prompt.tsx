"use client";

import * as React from "react";
import { Bell, ChevronLeft, ChevronRight, Download, EllipsisVertical, Plus, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, STORAGE_KEYS } from "@/config/site";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { useBottomNavHidden } from "@/components/layout/nav-visibility";
import { useOnboardingActive } from "@/features/onboarding/storage";
import { closeInstallGuide, openInstallGuide, promptInstall, useInstallState } from "@/lib/pwa/install-store";
import { isAndroid, isIOS, isIOSSafari, isStandalone } from "@/lib/platform";
import { readString, writeString } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";

export { openInstallGuide };

const DISMISS_DAYS = 14;
const VISIT_COUNTED_KEY = "gebzem.visitCounted";
const SHOW_DELAY_MS = 4000;

/**
 * A3: "Ana ekrana ekle" banner from the 2nd visit on (not during onboarding, not when installed),
 * dismissible for 14 days. Android/Chromium uses the native prompt; iOS Safari gets an illustrated guide.
 * Also renders the guide sheet opened by openInstallGuide() (settings page).
 */
export function InstallPrompt() {
  const { canPrompt, installed, guideOpen } = useInstallState();
  const onboardingActive = useOnboardingActive();
  const navHidden = useBottomNavHidden();
  const isClient = useIsClient();
  const [eligible, setEligible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!readString(VISIT_COUNTED_KEY, "session")) {
      const visits = Number(readString(STORAGE_KEYS.visits) ?? "0") + 1;
      writeString(STORAGE_KEYS.visits, String(visits));
      writeString(VISIT_COUNTED_KEY, "1", "session");
    }
    const visits = Number(readString(STORAGE_KEYS.visits) ?? "0");
    const dismissedAt = Number(readString(STORAGE_KEYS.installDismissedAt) ?? "0");
    const recentlyDismissed = Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    if (visits < 2 || recentlyDismissed || isStandalone()) return;
    const t = window.setTimeout(() => setEligible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const platformOk = canPrompt || isIOSSafari();
  const show = isClient && eligible && !dismissed && !installed && !onboardingActive && platformOk;

  const dismiss = () => {
    writeString(STORAGE_KEYS.installDismissedAt, String(Date.now()));
    setDismissed(true);
  };

  const install = async () => {
    if (canPrompt && !isIOS()) {
      const outcome = await promptInstall();
      if (outcome !== "accepted") dismiss();
      else setDismissed(true);
    } else {
      openInstallGuide();
    }
  };

  return (
    <>
      {show ? (
        <div
          className={cn(
            "fixed inset-x-0 z-40 mx-auto w-full max-w-2xl animate-slide-up px-3 pb-3",
            navHidden ? "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]" : "bottom-nav-offset",
          )}
          role="region"
          aria-label="Uygulamayı yükle"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-card p-3 pr-2 shadow-card ring-1 ring-foreground/[0.06]">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
              <Smartphone className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-bold">{APP_NAME}&apos;i ana ekrana ekle</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Daha hızlı açılır, bildirimleri kaçırmazsın.</p>
            </div>
            <Button size="sm" onClick={install} className="shrink-0">
              <Download /> Yükle
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={dismiss} aria-label="Şimdi değil" className="shrink-0 text-muted-foreground">
              <X />
            </Button>
          </div>
        </div>
      ) : null}
      <InstallGuideSheet open={guideOpen} onOpenChange={(o) => (o ? openInstallGuide() : closeInstallGuide())} installed={installed} />
    </>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">{n}</span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function IosGuide() {
  return (
    <ol className="flex flex-col gap-5">
      <Step
        n={1}
        title={
          <>
            Safari&apos;de <span className="text-primary">Paylaş</span> simgesine dokun
          </>
        }
      >
        <div className="flex h-12 items-center justify-around rounded-xl bg-muted px-4 text-muted-foreground" aria-hidden>
          <ChevronLeft className="size-5" strokeWidth={1.75} />
          <ChevronRight className="size-5" strokeWidth={1.75} />
          <span className="relative flex size-9 items-center justify-center rounded-lg bg-card text-primary shadow-soft ring-2 ring-primary">
            <Share className="size-5" />
            <span className="absolute inset-0 animate-pulse-ring rounded-lg bg-primary/30" />
          </span>
          <span className="size-4 rounded border-2 border-current" />
          <span className="size-4 rounded border-2 border-current" />
        </div>
      </Step>
      <Step
        n={2}
        title={
          <>
            Listeden <span className="text-primary">Ana Ekrana Ekle</span>&apos;yi seç
          </>
        }
      >
        <div className="overflow-hidden rounded-xl bg-muted text-sm" aria-hidden>
          <div className="flex items-center justify-between px-4 py-2.5 text-muted-foreground">
            Yer İşareti Ekle <span className="size-4 rounded-sm border-2 border-current" />
          </div>
          <div className="flex items-center justify-between border-t bg-card px-4 py-2.5 font-semibold ring-2 ring-primary ring-inset">
            Ana Ekrana Ekle <SquarePlus className="size-5 text-primary" />
          </div>
        </div>
      </Step>
      <Step
        n={3}
        title={
          <>
            Sağ üstteki <span className="text-primary">Ekle</span>&apos;ye dokun
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{APP_NAME} simgesi ana ekranında belirecek; oradan uygulama gibi açabilirsin.</p>
      </Step>
    </ol>
  );
}

function AndroidGuide() {
  return (
    <ol className="flex flex-col gap-5">
      <Step n={1} title="Tarayıcı menüsünü aç">
        <div className="flex h-12 items-center justify-end rounded-xl bg-muted px-4" aria-hidden>
          <span className="flex size-9 items-center justify-center rounded-lg bg-card text-primary ring-2 ring-primary">
            <EllipsisVertical className="size-5" />
          </span>
        </div>
      </Step>
      <Step
        n={2}
        title={
          <>
            <span className="text-primary">Uygulamayı yükle</span> ya da <span className="text-primary">Ana ekrana ekle</span>&apos;yi seç
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm font-semibold ring-2 ring-primary" aria-hidden>
          <Plus className="size-5 text-primary" /> Ana ekrana ekle
        </div>
      </Step>
    </ol>
  );
}

/** Illustrated "Ana ekrana ekle" instructions (iOS steps, Android menu, desktop hint). */
export function InstallGuideSheet({ open, onOpenChange, installed }: { open: boolean; onOpenChange: (open: boolean) => void; installed?: boolean }) {
  const ios = isIOS();
  const android = isAndroid();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ana ekrana ekle"
      description={`${APP_NAME}'i telefonuna uygulama gibi yükle. Ücretsiz, mağaza gerekmez.`}
      footer={
        <Button size="lg" variant="outline" onClick={() => onOpenChange(false)}>
          Tamam
        </Button>
      }
    >
      {installed || isStandalone() ? (
        <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">Uygulama bu cihazda zaten yüklü.</p>
      ) : ios ? (
        <>
          {!isIOSSafari() ? (
            <p className="mb-4 rounded-xl bg-highlight-soft px-4 py-3 text-sm">Bu adımlar Safari&apos;de çalışır. Sayfayı Safari&apos;de açıp tekrar dene.</p>
          ) : null}
          <IosGuide />
          <p className="mt-6 flex items-start gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm">
            <Bell className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            iPhone&apos;da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır.
          </p>
        </>
      ) : android ? (
        <AndroidGuide />
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Bilgisayarda adres çubuğunun sağındaki <strong className="text-foreground">yükle</strong> simgesine tıkla ya da tarayıcı menüsünden
          &quot;Uygulamayı yükle&quot;yi seç.
        </p>
      )}
    </BottomSheet>
  );
}
