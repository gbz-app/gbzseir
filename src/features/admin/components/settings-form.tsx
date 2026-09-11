"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "../actions/settings";
import { useAdminAction } from "./use-admin-action";

export type SettingsValues = {
  businessApplications: boolean;
  maintenanceBanner: string;
  supportPhone: string;
  supportEmail: string;
  listingDays: number;
  firstListingsModerated: number;
  listingDailyCap: number;
  listingActiveCap: number;
  maxProvidersDefault: number;
  analyticsRetentionDays: number;
  auditRetentionDays: number;
  /** app_settings.duty_data_mode. */
  dutyDataMode: "demo" | "off" | "live";
};

const DUTY_MODES: Array<{ value: SettingsValues["dutyDataMode"]; label: string }> = [
  { value: "demo", label: "Örnek veri (etiketli)" },
  { value: "off", label: "Kapalı (resmi listeye yönlendir)" },
  { value: "live", label: "Canlı (yalnızca gerçek liste)" },
];

function Row({ id, label, help, children }: { id?: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {help ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]">
      <h2 className="border-b py-3 font-heading text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Admin settings form (one save for everything). */
export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const { pending, run } = useAdminAction();
  const [v, setV] = React.useState(initial);
  const set = <K extends keyof SettingsValues>(k: K, value: SettingsValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveSettingsAction(v), { refresh: true });
      }}
    >
      <Section title="Uygulama">
        <Row id="st-apps" label="Yeni işletme başvuruları" help="Kapalıyken profil ve listelerdeki başvuru bağlantıları gizlenir; başvuru sayfası 'yakında' mesajı gösterir.">
          <div className="flex items-center gap-3">
            <Switch id="st-apps" checked={v.businessApplications} onCheckedChange={(c) => set("businessApplications", c)} />
            <span className="text-sm">{v.businessApplications ? "Açık" : "Kapalı"}</span>
          </div>
        </Row>
        <Row id="st-banner" label="Duyuru bandı" help="Boş bırakırsan görünmez. Doluysa uygulamanın üstünde tüm kullanıcılara gösterilir (bakım, önemli duyuru).">
          <Textarea id="st-banner" rows={2} maxLength={200} value={v.maintenanceBanner} onChange={(e) => set("maintenanceBanner", e.target.value)} placeholder="ör. Bu gece 02:00-03:00 arası bakım çalışması yapılacak." />
        </Row>
      </Section>

      <Section title="Nöbetçi eczane">
        <Row
          id="st-duty"
          label="Nöbet listesi verisi"
          help="Örnek veri: rastgele liste, her yerde 'Örnek veri' etiketiyle görünür. Kapalı: liste gizlenir, Eczacı Odası bağlantısı gösterilir. Canlı: yalnızca gerçek nöbet kayıtları; gerçek kayıt yoksa 'Liste doğrulanamadı' uyarısı çıkar. Örnek veri dışında günlük örnek liste üretimi durur."
        >
          <Select value={v.dutyDataMode} onValueChange={(m) => set("dutyDataMode", m as SettingsValues["dutyDataMode"])}>
            <SelectTrigger id="st-duty" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUTY_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title="İletişim">
        <Row id="st-phone" label="Destek telefonu" help="Yardım, kaynaklar, işletme tanıtım ve 'başvurular kapalı' ekranlarında arama butonu olur. Boşken gizlenir.">
          <Input id="st-phone" type="tel" value={v.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} placeholder="ör. 0850 123 45 67" />
        </Row>
        <Row id="st-email" label="Destek e-postası" help="Yardım ve kaynaklar sayfasında görünür. Boşken gizlenir.">
          <Input id="st-email" type="email" value={v.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} placeholder="ör. destek@alanadin.com" />
        </Row>
      </Section>

      <Section title="İlanlar ve talepler">
        <Row id="st-days" label="İlan yayın süresi (gün)" help="Yeni ilanlar bu süre sonunda süresi doldu olur; kullanıcı yenileyebilir.">
          <Input id="st-days" type="number" min={1} max={120} value={v.listingDays} onChange={(e) => set("listingDays", Number(e.target.value))} />
        </Row>
        <Row id="st-mod" label="Onaya düşen ilk ilan sayısı" help="Yeni kullanıcının ilk N ilanı yönetici onayından geçer. 0 = hiçbiri.">
          <Input id="st-mod" type="number" min={0} max={50} value={v.firstListingsModerated} onChange={(e) => set("firstListingsModerated", Number(e.target.value))} />
        </Row>
        <Row id="st-daily" label="Günlük ilan sınırı" help="Bir kullanıcı 24 saatte en fazla bu kadar yeni ilan verebilir. 0 = sınır yok.">
          <Input id="st-daily" type="number" min={0} max={100} value={v.listingDailyCap} onChange={(e) => set("listingDailyCap", Number(e.target.value))} />
        </Row>
        <Row id="st-active" label="Açık ilan sınırı" help="Bir kullanıcının aynı anda yayında, onay bekleyen ve durdurulmuş ilan sayısı. 0 = sınır yok.">
          <Input id="st-active" type="number" min={0} max={1000} value={v.listingActiveCap} onChange={(e) => set("listingActiveCap", Number(e.target.value))} />
        </Row>
        <Row
          id="st-prov"
          label="Bir talebe en fazla firma"
          help="Kendi kabul limiti olmayan hizmet kategorilerinde geçerlidir; limiti girilmiş kategoriler kendi değerini kullanır. Yeni talepler için uygulanır."
        >
          <Input id="st-prov" type="number" min={1} max={10} value={v.maxProvidersDefault} onChange={(e) => set("maxProvidersDefault", Number(e.target.value))} />
        </Row>
      </Section>

      <Section title="Veri ve gizlilik">
        <Row id="st-ret" label="Analitik saklama süresi (gün)" help="Sayfa görüntüleme ve oturum kayıtları bu süreden sonra her gece silinir (KVKK).">
          <Input id="st-ret" type="number" min={30} max={730} value={v.analyticsRetentionDays} onChange={(e) => set("analyticsRetentionDays", Number(e.target.value))} />
        </Row>
        <Row id="st-audit" label="İşlem kaydı saklama süresi (gün)" help="Hesap ve içerik işlem kayıtları (kim, ne zaman, ne yaptı) bu süreden sonra her gece silinir.">
          <Input id="st-audit" type="number" min={30} max={3650} value={v.auditRetentionDays} onChange={(e) => set("auditRetentionDays", Number(e.target.value))} />
        </Row>
      </Section>

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button type="submit" size="lg" disabled={pending || !dirty} className="shadow-float">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {dirty ? "Değişiklikleri kaydet" : "Kaydedildi"}
        </Button>
      </div>
    </form>
  );
}
