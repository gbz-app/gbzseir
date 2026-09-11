import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { APP_NAME } from "@/config/site";
import { displayTrPhone, getAppSettings } from "@/lib/app-settings";
import { formatPhoneInputTR, fromSupabasePhone, telHref } from "@/core/phone";
import { routes } from "@/core/routes";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ECZACI_ODASI_NAME } from "@/features/nearby/config";
import { type MyMessage } from "@/features/support/my-messages";
import { SupportCenter } from "@/features/support/support-center";
import { SupportFooter } from "@/features/support/support-footer";

export const metadata: Metadata = {
  title: "Yardım ve destek",
  description: `${APP_NAME} destek merkezi: şikayet bildir, teknik destek al, reklam ve iş birliği için bize ulaş. Sık sorulan sorular.`,
  alternates: { canonical: routes.content.help() },
};

const BUSINESS_Q = "İşletmemi nasıl eklerim?";
/** Answer while business sign-ups are open (app setting); the FAQ entry below is the "paused" answer. */
const BUSINESS_OPEN_A =
  "Profil > \"İşletmen mi var?\" kartından ya da İşletme paneli > Yeni işletme ekle adımından birkaç dakikada işletmeni açabilirsin; bilgilerini gönderdiğin anda sayfan yayına girer. Bir hesapla bir işletme açabilirsin; ikinci bir işletme için destek ekibimize yaz, hesabına ekleyelim.";

const DUTY_Q = "Nöbetçi eczane bilgisi nereden geliyor?";
/** Answers per duty_data_mode (app setting); the FAQ entry below is the "demo" answer. */
const DUTY_A: Partial<Record<string, string>> = {
  off: `Nöbet listesini şu an göstermiyoruz. Güncel ve resmi liste için ${ECZACI_ODASI_NAME}'nın sitesine bakabilirsin.`,
  live: `Nöbet listesi resmi nöbet listesine göre güncellenir. Son durum için ${ECZACI_ODASI_NAME}'nın sitesine de bakabilirsin; gitmeden önce eczaneyi aramanı öneririz.`,
};

const FAQ: Array<{ q: string; a: string }> = [
  { q: "Uygulamada neden mesajlaşma yok?", a: `${APP_NAME}'de iletişim yalnızca telefonla yapılır. Böylece dolandırıcılık ve spam mesajların önüne geçiyoruz. İlan ve işletme sayfalarındaki "Ara" butonunu kullanabilirsin.` },
  { q: "İlanım neden yayına alınmadı?", a: "Yasaklı kategorideki (emlak, vasıta, ilaç, silah, canlı hayvan, alkol, tütün) ya da eksik bilgili ilanlar yayına alınmaz. Profil > İlanlarım sayfasında ret nedenini görebilir, düzeltip tekrar gönderebilirsin." },
  { q: DUTY_Q, a: `Şu an gösterilen nöbet listesi örnek veridir, gerçek nöbet listesi değildir. Resmi liste için ${ECZACI_ODASI_NAME}'nın sitesine bakabilirsin.` },
  { q: BUSINESS_Q, a: "Yeni işletme başvuruları yakında açılacak. Şimdilik bu sayfada \"İşletmemi ekletmek istiyorum\" konusunu seçip bize yazabilirsin; ekibimiz seni arar." },
  { q: "Reklam vermek istiyorum, ne yapmalıyım?", a: "Bu sayfada \"Reklam ve iş birliği\" konusunu seçip bize yaz. Ana sayfa vitrini, kategori öne çıkarma ve etkinlik tanıtımı gibi seçenekleri seninle konuşuruz." },
  { q: "Hesabımı nasıl silerim?", a: "Profil > Ayarlar > Hesabı sil adımlarını izleyebilirsin. Silme işlemi telefonuna gelen kod ile onaylanır ve geri alınamaz." },
  { q: "Bir ilan ya da işletmeyi nasıl şikayet ederim?", a: "İlgili sayfadaki ⋯ menüsünden \"Şikayet et\"i seç ya da bu sayfada \"Şikayet bildir\" konusunu seçip bize yaz." },
];

/** Yardım ve destek merkezi: step-by-step contact flow, Mesajlarım, FAQ, contacts and legal links. */
export default async function HelpPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getAppSettings()]);
  let messages: MyMessage[] = [];
  let prefill = { name: "", phone: "" };
  if (user) {
    const [profile, supabase] = await Promise.all([getProfile().catch(() => null), createClient()]);
    const phone = profile?.phone ?? fromSupabasePhone(user.phone);
    prefill = { name: profile?.full_name ?? "", phone: phone ? formatPhoneInputTR(phone) : "" };
    const { data } = await supabase
      .from("contact_messages")
      .select("id,topic,subject,message,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    messages = (data ?? []) as MyMessage[];
  }
  // Answers that follow the app settings.
  const faq = FAQ.map((f) => {
    if (f.q === BUSINESS_Q && settings.businessApplications) return { ...f, a: BUSINESS_OPEN_A };
    if (f.q === DUTY_Q) return { ...f, a: DUTY_A[settings.dutyDataMode] ?? f.a };
    return f;
  });

  return (
    <SupportCenter prefill={prefill} loggedIn={!!user} messages={messages}>
      <section aria-labelledby="sss-baslik">
        <h2 id="sss-baslik" className="mb-2 text-lg font-semibold">
          Sık sorulan sorular
        </h2>
        <Accordion type="single" collapsible className="rounded-3xl bg-card px-4">
          {faq.map((f, i) => (
            <AccordionItem key={f.q} value={`s${i}`}>
              <AccordionTrigger className="py-4 text-left text-[15px] font-semibold hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="pb-4 text-[15px] leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Contact cards only for contacts set in Admin > Ayarlar (the flow above always works). */}
      {settings.supportPhone || settings.supportEmail ? (
        <section aria-label="Bize doğrudan ulaş" className={`grid gap-2.5 ${settings.supportPhone && settings.supportEmail ? "grid-cols-2" : ""}`}>
          {settings.supportPhone ? (
            <a href={telHref(settings.supportPhone)} className="flex flex-col gap-1 rounded-3xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Phone className="size-5 text-primary" aria-hidden />
              <span className="mt-1 text-xs text-muted-foreground">Telefon</span>
              <span className="text-sm font-semibold">{displayTrPhone(settings.supportPhone)}</span>
            </a>
          ) : null}
          {settings.supportEmail ? (
            <a href={`mailto:${settings.supportEmail}`} className="flex min-w-0 flex-col gap-1 rounded-3xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Mail className="size-5 text-primary" aria-hidden />
              <span className="mt-1 text-xs text-muted-foreground">E-posta</span>
              <span className="truncate text-sm font-semibold">{settings.supportEmail}</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <SupportFooter />
    </SupportCenter>
  );
}
