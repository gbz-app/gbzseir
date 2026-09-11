"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, Download, FileText, MapPinOff, Megaphone, PlayCircle, Smartphone, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { openInstallGuide } from "@/components/pwa/install-prompt";
import { resetOnboarding } from "@/features/onboarding/storage";
import { useAuth } from "@/lib/auth/auth-provider";
import { clearLocationPrefs } from "@/lib/location/store";
import { getPushState, isPushSubscribed, subscribePush, unsubscribePush, type PushState } from "@/lib/push/client";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

function ActionRow({ icon: Icon, label, hint, onClick, href, danger }: { icon: LucideIcon; label: string; hint?: string; onClick?: () => void; href?: string; danger?: boolean }) {
  const inner = (
    <>
      <Icon className={danger ? "size-5 text-destructive" : "size-5 text-muted-foreground"} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={danger ? "block text-[15px] font-medium text-destructive" : "block text-[15px] font-medium"}>{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </>
  );
  const cls = "flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

type ToggleRowProps = {
  id: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** Row with a switch; the whole row toggles it. */
function ToggleRow({ id, icon: Icon, label, hint, checked, disabled, onCheckedChange }: ToggleRowProps) {
  return (
    <label htmlFor={id} className={cn("flex min-h-13 w-full items-center gap-3 px-4 py-3", disabled ? "cursor-default" : "cursor-pointer")}>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function pushHint(state: PushState, subscribed: boolean, signedIn: boolean): string {
  if (subscribed) return "Bu cihazda açık. Gelişmeleri anında haber veririz.";
  if (state === "unsupported") return "Bu tarayıcı bildirimleri desteklemiyor.";
  if (state === "ios-needs-install") return "iPhone'da önce uygulamayı ana ekrana eklemelisin.";
  if (state === "denied") return "Bildirim izni kapalı. Tarayıcı ayarlarından açabilirsin.";
  if (!signedIn) return "Bildirim almak için giriş yapmalısın.";
  return "Talep, ilan ve işletme gelişmelerini bu cihaza bildirelim.";
}

// The shared Profile type (lib/types.ts) is hand-written; select("*") also returns marketing_consent_at.
type ConsentProfile = { marketing_consent: boolean | null; marketing_consent_at?: string | null };

function consentHint(p: ConsentProfile | null): string {
  const date = p?.marketing_consent_at ? formatDate(p.marketing_consent_at, { month: "long", year: true }) : null;
  if (p?.marketing_consent) return date ? `${date} tarihinde izin verdin.` : "Kampanya ve duyuruları sana iletebiliriz.";
  return date ? `${date} tarihinde izni geri aldın.` : "Kampanya ve duyuru bildirimleri için izin.";
}

/** Ayarlar: theme, notifications on/off, marketing consent, app helpers, account and legal links. */
export function SettingsScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [pushState, setPushState] = React.useState<PushState>("unsupported");
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [consentBusy, setConsentBusy] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let active = true;
    void isPushSubscribed()
      .catch(() => false)
      .then((s) => {
        if (!active) return;
        setPushState(getPushState());
        setSubscribed(s);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const enablePush = async () => {
    if (getPushState() === "ios-needs-install") {
      toast.message("iPhone'da bildirimler için önce uygulamayı ana ekrana ekle.");
      openInstallGuide();
      return;
    }
    setPushBusy(true);
    const res = await subscribePush();
    setPushBusy(false);
    setPushState(getPushState());
    if (res.ok) {
      setSubscribed(true);
      toast.success("Bildirimler açıldı");
    } else if (res.reason === "not-signed-in") {
      router.push(routes.auth.login(routes.profile.settings()));
    } else {
      toast.error(res.message);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    const ok = await unsubscribePush();
    if (ok) {
      setSubscribed(false);
      toast.success("Bildirimler kapatıldı");
    } else {
      // The DB row may already be gone: show the real state.
      setSubscribed(await isPushSubscribed().catch(() => true));
      toast.error("Bildirimler kapatılamadı. Lütfen tekrar dene.");
    }
    setPushBusy(false);
  };

  const setConsent = async (next: boolean) => {
    if (!user) return;
    setConsentBusy(next);
    const { error } = await createClient().from(TABLES.profiles).update({ marketing_consent: next }).eq("id", user.id);
    if (error) {
      toast.error("İzin güncellenemedi. Lütfen tekrar dene.");
    } else {
      await refreshProfile();
      toast.success(next ? "Ticari ileti izni verildi" : "Ticari ileti izni geri alındı");
    }
    setConsentBusy(null);
  };

  const consentProfile: ConsentProfile | null = profile;
  const pushOn = subscribed === true;
  const pushDisabled = subscribed === null || pushBusy || (!pushOn && (pushState === "unsupported" || pushState === "denied"));

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <Section title="Görünüm">
        <div className="p-3">
          <ThemeToggle />
        </div>
      </Section>

      <Section title="Bildirimler">
        <ToggleRow
          id="ayarlar-bildirimler"
          icon={Bell}
          label="Bildirimler"
          hint={subscribed === null ? undefined : pushHint(pushState, pushOn, !!user)}
          checked={pushOn}
          disabled={pushDisabled}
          onCheckedChange={(on) => void (on ? enablePush() : disablePush())}
        />
      </Section>

      {user ? (
        <Section title="İzinler">
          <ToggleRow
            id="ayarlar-ticari-ileti"
            icon={Megaphone}
            label="Ticari ileti izni"
            hint={consentProfile ? consentHint(consentProfile) : undefined}
            checked={consentBusy ?? !!consentProfile?.marketing_consent}
            disabled={!consentProfile || consentBusy !== null}
            onCheckedChange={(on) => void setConsent(on)}
          />
        </Section>
      ) : null}

      <Section title="Uygulama">
        <ActionRow icon={Download} label="Ana ekrana ekle" hint="Uygulama gibi hızlıca aç." onClick={() => openInstallGuide()} />
        <ActionRow
          icon={PlayCircle}
          label="Tanıtımı tekrar izle"
          onClick={() => {
            resetOnboarding();
            router.push(routes.home());
          }}
        />
        <ActionRow
          icon={MapPinOff}
          label="Konum ve mahalle bilgimi sil"
          hint="Bu cihazda saklanan yaklaşık konumu siler."
          onClick={() => {
            clearLocationPrefs();
            toast.success("Konum bilgin silindi");
          }}
        />
      </Section>

      {user ? (
        <Section title="Hesap">
          <ActionRow icon={Smartphone} label="Telefon numarasını değiştir" href={routes.profile.changePhone()} />
          <ActionRow icon={Trash2} label="Hesabı sil" href={routes.profile.deleteAccount()} danger />
        </Section>
      ) : null}

      <Section title="Yasal">
        <ActionRow icon={FileText} label="KVKK Aydınlatma Metni" href={routes.legal.kvkk()} />
        <ActionRow icon={FileText} label="Kullanım Koşulları" href={routes.legal.terms()} />
        <ActionRow icon={FileText} label="Gizlilik Politikası" href={routes.legal.privacy()} />
      </Section>
    </div>
  );
}
