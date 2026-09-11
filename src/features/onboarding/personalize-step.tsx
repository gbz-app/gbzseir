"use client";

import * as React from "react";
import { BellRing, CircleCheck, Loader2, LocateFixed, MapPin, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DistrictPicker } from "@/components/shared/district-picker";
import { districtName } from "@/config/districts";
import { useAuth } from "@/lib/auth/auth-provider";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { getPushState, isPushSubscribed, subscribePush, type PushState } from "@/lib/push/client";
import { enter } from "./motion";

/**
 * Last onboarding step: three optional, benefit-first rows (permission priming). Each native prompt is asked only
 * from its own tap, nothing blocks "Başla", and every row shows its result in place.
 *  - İlçe: the shared DistrictPicker (saved as this device's default district).
 *  - Konum: useApproxLocation().request(); the district of the fix fills the İlçe row by itself.
 *  - Bildirim: subscribePush() needs a signed-in user, so guests get a short "after login" line instead of a button.
 */
export function PersonalizeStep({ className }: { className?: string }) {
  const location = useApproxLocation();
  const { user, loading: authLoading } = useAuth();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  // The slides only render in the browser, so reading the permission state on mount is safe.
  const [pushState, setPushState] = React.useState<PushState>(() => getPushState());
  const [pushOn, setPushOn] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = React.useState(false);

  // Permission already granted: find out whether this device is subscribed for this account.
  React.useEffect(() => {
    if (!user || pushState !== "granted") return;
    let alive = true;
    isPushSubscribed()
      .then((subscribed) => {
        if (alive && subscribed) setPushOn(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user, pushState]);

  // Manual choice or the district of the GPS fix.
  const district = location.district;
  const districtLabel = district ? districtName(district) : null;
  const gps = location.status === "granted" && !!location.coords;
  const locating = location.status === "locating";

  const enablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    let res: Awaited<ReturnType<typeof subscribePush>>;
    try {
      res = await subscribePush();
    } catch {
      res = { ok: false, reason: "error", message: "Bildirimler açılamadı. Lütfen tekrar dene." };
    } finally {
      setPushBusy(false);
    }
    if (res.ok) {
      setPushOn(true);
      return;
    }
    const next = getPushState();
    setPushState(next);
    if (res.reason === "not-signed-in") setNeedsLogin(true);
    else if (next !== "denied" && next !== "ios-needs-install" && next !== "unsupported") setPushError(res.message);
  };

  let pushRow: React.ReactNode = null;
  if (pushState !== "unsupported") {
    const guest = !authLoading && (!user || needsLogin);
    if (pushOn) {
      pushRow = <Row icon={BellRing} title="Bildirimler açık" sub="Önemli gelişmeleri bu cihaza göndereceğiz." state="done" d={420} />;
    } else if (pushState === "ios-needs-install") {
      pushRow = <Row icon={BellRing} title="Bildirimler" sub="iPhone'da bildirimleri, uygulamayı ana ekrana ekledikten sonra açabilirsin." d={420} />;
    } else if (pushState === "denied") {
      pushRow = <Row icon={BellRing} title="Bildirimler kapalı" sub="İstersen tarayıcı ayarlarından açabilirsin." d={420} />;
    } else if (guest) {
      pushRow = <Row icon={BellRing} title="Bildirimler" sub="Giriş yaptıktan sonra Ayarlar'dan açabilirsin." d={420} />;
    } else {
      pushRow = (
        <Row
          icon={BellRing}
          title="Bildirimleri aç"
          sub={pushError ?? "Nöbetçi eczane, teklifler ve etkinlikler için haber verelim."}
          subTone={pushError ? "error" : "muted"}
          state={pushBusy || authLoading ? "busy" : "idle"}
          action="Aç"
          label="Bildirimleri aç"
          onClick={() => void enablePush()}
          d={420}
        />
      );
    }
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <Row
        icon={MapPin}
        title={districtLabel ?? "İlçeni seç"}
        sub={districtLabel ? "İlçen seçildi, istediğin zaman değiştirebilirsin." : "İlçendeki yerleri öne çıkaralım."}
        state={districtLabel ? "done" : "idle"}
        action={districtLabel ? "Değiştir" : "Seç"}
        label={districtLabel ? `İlçeni değiştir, şu an ${districtLabel}` : "İlçeni seç"}
        haspopup
        onClick={() => setPickerOpen(true)}
        d={260}
      />
      <Row
        icon={LocateFixed}
        title={gps ? "Konumun açık" : "Konumunu kullan"}
        sub={
          gps
            ? "En yakın eczane ve yerleri sana göre sıralayacağız."
            : (location.error ?? "En yakın eczaneyi bulalım, konumun cihazında kalır.")
        }
        subTone={!gps && location.error ? "error" : "muted"}
        state={gps ? "done" : locating ? "busy" : "idle"}
        action={gps ? undefined : "İzin ver"}
        label="Konumunu kullan"
        onClick={gps ? undefined : () => void location.request()}
        d={340}
      />
      {pushRow}

      <DistrictPicker open={pickerOpen} onOpenChange={setPickerOpen} showTrigger={false} value={district} persistDefault />
    </div>
  );
}

type RowProps = {
  icon: LucideIcon;
  title: string;
  sub: string;
  subTone?: "muted" | "error";
  state?: "idle" | "busy" | "done";
  /** Small pill on the right (the row is a button when onClick is set). */
  action?: string;
  onClick?: () => void;
  /** Accessible name of the button; the sub line is linked as its description. */
  label?: string;
  haspopup?: boolean;
  /** Entrance delay (ms). */
  d: number;
};

function Row({ icon: Icon, title, sub, subTone = "muted", state = "idle", action, onClick, label, haspopup, d }: RowProps) {
  const subId = React.useId();
  const e = enter("rise", d);
  const busy = state === "busy";
  const body = (
    <>
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
          state === "done" ? "bg-success-soft text-success" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-semibold">{title}</span>
        <span id={subId} className={cn("mt-1 block text-[13px] leading-snug", subTone === "error" ? "text-destructive" : "text-muted-foreground")}>
          {sub}
        </span>
      </span>
      {busy ? (
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
      ) : action ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-3.5 py-2 text-[13px] font-semibold text-primary">{action}</span>
      ) : state === "done" ? (
        <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={2} aria-hidden />
      ) : null}
    </>
  );
  const cls = cn("flex min-h-[4.5rem] w-full items-center gap-3 rounded-card bg-card px-3.5 py-3 text-left", e.className);

  if (!onClick) {
    return (
      <div className={cls} style={e.style}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label={label}
      aria-describedby={subId}
      aria-haspopup={haspopup ? "dialog" : undefined}
      className={cn(
        cls,
        "outline-none transition-[scale] active:scale-[0.985] focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-progress",
      )}
      style={e.style}
    >
      {body}
    </button>
  );
}
