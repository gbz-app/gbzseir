import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CircleAlert,
  FileText,
  Hourglass,
  ImagePlus,
  Inbox,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Rocket,
  Search,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { VerifiedBadge } from "@/components/shared/badges";
import { APP_NAME, CITY } from "@/config/site";
import { displayTrPhone, getAppSettings } from "@/lib/app-settings";
import { telHref } from "@/core/phone";
import { routes } from "@/core/routes";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { RatingInline } from "@/features/business/components/rating";
import { getOwnerBusinessList } from "@/features/business/lib/owner-queries";

export const metadata: Metadata = {
  title: "İşletme hesabı",
  description: `İşletmeni ${CITY.name}'ye ücretsiz tanıt: işletme sayfası, Yakınımda haritası, hizmet talepleri, iş ilanları ve müşteri yorumları ${APP_NAME}'de.`,
  alternates: { canonical: routes.business.intro() },
};

const BENEFITS: Array<{ icon: LucideIcon; title: string; text: string; tone: string }> = [
  { icon: Store, title: "Ücretsiz işletme sayfası", text: "Logon, fotoğrafların, çalışma saatlerin ve telefonun tek sayfada.", tone: "bg-brand-soft text-primary" },
  { icon: MapPin, title: "Yakınımda haritasında görün", text: "Çevrendeki Gebzeliler seni haritada bulsun, yol tarifi alsın.", tone: "bg-info-soft text-info" },
  { icon: Inbox, title: "Hizmet talepleri al", text: "Bölgendeki müşteri taleplerini gör, uygun olanları kabul et.", tone: "bg-highlight-soft text-highlight-foreground dark:text-highlight" },
  { icon: Briefcase, title: "İşletme adına iş ilanı ver", text: "Personel ilanlarını işletmen adına, onaylı olarak yayınla.", tone: "bg-success-soft text-success" },
  { icon: Star, title: "Yorum topla", text: "Çalıştığın müşteriler puan versin, sen de yorumlara yanıt ver.", tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
];

const NEEDS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: ImagePlus, text: "Logo (varsa)" },
  { icon: Phone, text: "İşletme telefonu" },
  { icon: MapPin, text: "Adres" },
  { icon: FileText, text: "Varsa vergi levhası" },
];

const TIMELINE: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: FileText, title: "Bilgiler", text: "~3 dakika" },
  { icon: Rocket, title: "Yayında", text: "Hemen" },
  { icon: Search, title: "Bulunursun", text: "Müşteri arar" },
];

/** 3a: "İşletme hesabına geç" introduction; guests can read it, the CTA asks for login. */
export default async function BusinessIntroPage() {
  const user = await getCurrentUser();
  const profile = user ? await getProfile() : null;
  const owned = user ? await getOwnerBusinessList().catch(() => []) : [];
  const settings = await getAppSettings();
  const previewName = profile?.full_name?.trim() || "Senin İşletmen";

  const live = owned.find((b) => b.status === "approved");
  const unfinished = owned.find((b) => b.status === "pending" || b.status === "rejected");
  let note: React.ReactNode = null;
  let secondary: { href: string; label: string } | null = null;
  let primary: { href: string; label: string } = {
    href: user ? routes.business.apply() : routes.auth.login(routes.business.apply()),
    label: "İşletmemi aç",
  };
  if (live) {
    primary = { href: routes.business.root(), label: "İşletme Paneli" };
    if (settings.businessApplications && !owned.some((b) => b.status === "suspended")) secondary = { href: routes.business.apply(), label: "Yeni işletme ekle" };
  } else if (unfinished) {
    note = (
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Hourglass className="size-4 text-highlight" aria-hidden /> {unfinished.name} henüz yayında değil. Bilgilerini tamamla, hemen yayına girsin.
      </p>
    );
    primary = { href: routes.business.applyEdit(unfinished.id), label: "Bilgileri tamamla" };
  } else if (owned.length > 0) {
    note = (
      <p className="flex items-start gap-2 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        İşletme hesabın askıya alındı. Destek ekibiyle iletişime geç.
      </p>
    );
    primary = { href: routes.content.help(), label: "Yardım ve iletişim" };
  } else if (!settings.businessApplications) {
    note = <p className="text-sm">Yeni işletme başvuruları yakında açılacak. İşletmeni listelemek ya da reklam vermek için bize ulaşabilirsin.</p>;
    // No support phone set yet: the support form instead.
    primary = settings.supportPhone
      ? { href: telHref(settings.supportPhone), label: `Bizi ara: ${displayTrPhone(settings.supportPhone)}` }
      : { href: routes.content.help("isletme"), label: "Bize yaz" };
  }

  return (
    <>
      <PageHeader title="İşletme hesabı" backHref={routes.profile.root()} hideBottomNav />
      <div className="flex flex-col gap-8 px-4 pt-5 pb-44">
        <section aria-label="Önizleme" className="rounded-3xl bg-linear-to-br from-brand-soft via-background to-highlight-soft p-4 ring-1 ring-foreground/[0.06]">
          <p className="mb-3 text-center text-xs font-bold tracking-wide text-primary uppercase">Senin işletmen burada böyle görünecek</p>
          <div className="animate-slide-up rounded-2xl bg-card p-4 shadow-card" aria-hidden>
            <div className="flex items-center gap-3">
              <BusinessLogo name={previewName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] font-bold">{previewName}</p>
                  <VerifiedBadge className="h-5 shrink-0 px-1.5 text-[11px]" />
                </div>
                <RatingInline avg={4.9} count={12} className="mt-0.5" />
                <p className="truncate text-xs text-muted-foreground">Senin kategorin · {CITY.name}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-success-foreground">
                <Phone className="size-4" /> Ara
              </span>
              <span className="flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold">
                <Navigation className="size-4" /> Yol tarifi
              </span>
            </div>
          </div>
        </section>

        <header>
          <h2 className="text-[1.7rem] leading-tight font-extrabold text-balance">İşletmeni {CITY.name}&apos;ye tanıt</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {CITY.name}liler seni bulsun, arasın. İşletme hesabı tamamen ücretsiz.
          </p>
        </header>

        <section aria-labelledby="avantajlar">
          <h3 id="avantajlar" className="sr-only">
            Avantajlar
          </h3>
          <ul className="flex flex-col gap-3">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3.5">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${b.tone}`}>
                  <b.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block font-bold">{b.title}</span>
                  <span className="block text-sm leading-snug text-muted-foreground">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="hazirlik" className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <h3 id="hazirlik" className="font-bold">
            Hazırlaman gerekenler
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-2.5">
            {NEEDS.map((n) => (
              <li key={n.text} className="flex items-center gap-2 text-sm">
                <n.icon className="size-4 shrink-0 text-primary" aria-hidden />
                {n.text}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="surec">
          <h3 id="surec" className="mb-3 font-bold">
            Nasıl işliyor?
          </h3>
          <ol className="flex items-start">
            {TIMELINE.map((t, i) => (
              <li key={t.title} className="relative flex flex-1 flex-col items-center text-center">
                {i < TIMELINE.length - 1 ? <span className="absolute top-5 left-1/2 h-0.5 w-full bg-primary/25" aria-hidden /> : null}
                <span className="relative flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
                  <t.icon className="size-4" aria-hidden />
                </span>
                <span className="mt-2 text-sm font-bold">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.text}</span>
                {i < TIMELINE.length - 1 ? <ArrowRight className="sr-only" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Başvurarak{" "}
          <Link href={routes.legal.terms()} className="font-semibold text-primary underline underline-offset-2">
            Kullanım Koşulları
          </Link>
          &apos;nı kabul etmiş olursun. Onaylı işletmeler emlak, vasıta, ilaç, silah, canlı hayvan, alkol ve tütün satışı yapamaz.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-float backdrop-blur-md">
        {note ? <div className="mb-2.5">{note}</div> : null}
        <div className="flex flex-col gap-1.5">
          <Button asChild size="lg">
            <Link href={primary.href}>
              {primary.label} <ArrowRight />
            </Link>
          </Button>
          {secondary ? (
            <Button asChild variant="outline">
              <Link href={secondary.href}>
                <Plus /> {secondary.label}
              </Link>
            </Button>
          ) : owned.length === 0 ? (
            <Button asChild variant="ghost" className="text-muted-foreground">
              <Link href={routes.profile.root()}>Şimdi değil</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
