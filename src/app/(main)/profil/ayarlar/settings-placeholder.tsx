"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, ChevronRight, Download, FileText, MapPinOff, PlayCircle, Smartphone, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { openInstallGuide } from "@/components/pwa/install-prompt";
import { resetOnboarding } from "@/features/onboarding/storage";
import { useAuth } from "@/lib/auth/auth-provider";
import { clearLocationPrefs } from "@/lib/location/store";
import { getPushState, isPushSubscribed, sendTestPush, subscribePush } from "@/lib/push/client";
import { routes } from "@/core/routes";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">{children}</div>
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

export function SettingsPlaceholder() {
  const router = useRouter();
  const { user } = useAuth();
  const [subscribed, setSubscribed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void isPushSubscribed().then((s) => active && setSubscribed(s));
    return () => {
      active = false;
    };
  }, []);

  const enablePush = async () => {
    const state = getPushState();
    if (state === "ios-needs-install") {
      toast.message("iPhone'da bildirimler için önce uygulamayı ana ekrana ekle.");
      openInstallGuide();
      return;
    }
    const res = await subscribePush();
    if (res.ok) {
      setSubscribed(true);
      toast.success("Bildirimler açıldı");
    } else if (res.reason === "not-signed-in") {
      router.push(routes.auth.login(routes.profile.settings()));
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <Section title="Görünüm">
        <div className="p-3">
          <ThemeToggle />
        </div>
      </Section>

      <Section title="Bildirimler">
        {subscribed ? (
          <ActionRow
            icon={BellRing}
            label="Test bildirimi gönder"
            hint="Bu cihazda bildirimler açık."
            onClick={async () => {
              const r = await sendTestPush();
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            }}
          />
        ) : (
          <ActionRow icon={Bell} label="Bildirimleri aç" hint="Taleplerine yanıt gelince haber verelim." onClick={enablePush} />
        )}
      </Section>

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
