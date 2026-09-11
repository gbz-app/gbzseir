import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CircleAlert,
  FileText,
  Hourglass,
  ImagePlus,
  LifeBuoy,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { BottomDock } from "@/components/shared/bottom-dock";
import { VerifiedBadge } from "@/components/shared/badges";
import { APP_NAME, CITY } from "@/config/site";
import { displayTrPhone, getAppSettings } from "@/lib/app-settings";
import { telHref } from "@/core/phone";
import { routes } from "@/core/routes";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { RatingInline } from "@/features/business/components/rating";
import { businessLimitText, fetchBusinessQuota, newBusinessHelpHref } from "@/features/business/lib/business-quota";
import { getOwnerBusinessList } from "@/features/business/lib/owner-queries";

export const metadata: Metadata = {
  title: "İşletme hesabı",
  description: `İşletmeni ${CITY.province}'ye ücretsiz tanıt: işletme sayfası, Yakınımda haritası, QR menü, oda ve hizmet listesi, iş ilanları ve müşteri yorumları ${APP_NAME}'de.`,
  alternates: { canonical: routes.business.intro() },
};

const BENEFITS: Array<{ icon: LucideIcon; title: string; text: string; tone: string }> = [
  { icon: Store, title: "Ücretsiz işletme sayfası", text: "Logon, fotoğrafların, çalışma saatlerin ve telefonun tek sayfada.", tone: "bg-brand-soft text-primary" },
  { icon: Sparkles, title: "Türüne göre araçlar", text: "Restoran ve kafeye QR menü, otele odalar, hizmet firmasına müşteri talepleri.", tone: "bg-highlight-soft text-highlight-foreground dark:text-highlight" },
  { icon: MapPin, title: "Yakınımda haritasında görün", text: "Çevrendeki müşteriler seni haritada bulsun, yol tarifi alsın.", tone: "bg-info-soft text-info" },
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

/** Black primary CTA. */
const BLACK = "bg-foreground text-background hover:bg-foreground/90";

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
  let secondary: { href: string; label: string; icon: LucideIcon } | null = null;
  let primary: { href: string; label: string } = {
    href: user ? routes.business.apply() : routes.auth.login(routes.business.apply()),
    label: "İşletmemi aç",
  };
  if (live) {
    primary = { href: routes.business.root(), label: "İşletme Paneli" };
    if (settings.businessApplications && !owned.some((b) => b.status === "suspended")) {
      // One business per account: once reached, "Yeni işletme ekle" becomes a message to the support team.
      const quota = await fetchBusinessQuota(await createClient());
      if (quota && !quota.canAdd) {
        note = <p className="text-sm leading-relaxed text-muted-foreground">{businessLimitText(quota.limit)}</p>;
        secondary = { href: newBusinessHelpHref(), label: "Destek ekibine yaz", icon: LifeBuoy };
      } else {
        secondary = { href: routes.business.apply(), label: "Yeni işletme ekle", icon: Plus };
      }
    }
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

  // Room for the BottomDock: primary (h-12) + secondary / "Şimdi değil" row, plus up to 3 lines of note, plus safe area.
  const dockSpace = note
    ? "pb-[calc(14.5rem+env(safe-area-inset-bottom,0px))]"
    : secondary
      ? "pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))]"
      : "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]";

  return (
    <>
      <PageHeader title="İşletme hesabı" backHref={routes.profile.root()} hideBottomNav />
      <div className={`flex flex-col gap-8 px-4 pt-5 ${dockSpace}`}>
        <section aria-label="Önizleme" className="rounded-3xl bg-linear-to-br from-brand-soft via-background to-highlight-soft p-4">
          <p className="mb-3 text-center text-xs font-bold tracking-wide text-primary uppercase">Senin işletmen burada böyle görünecek</p>
          <div className="animate-slide-up rounded-2xl bg-card p-4" aria-hidden>
            <div className="flex items-center gap-3">
              <BusinessLogo name={previewName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-[15px] font-bold">{previewName}</p>
                  <VerifiedBadge className="h-5 shrink-0 px-1.5 text-[11px]" />
                </div>
                <RatingInline avg={4.9} count={12} className="mt-0.5" />
                <p className="truncate text-xs text-muted-foreground">Senin kategorin · Senin ilçen</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-success-foreground">
                <Phone className="size-4" /> Ara
              </span>
              <span className="flex h-10 items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-semibold">
                <Navigation className="size-4" /> Yol tarifi
              </span>
            </div>
          </div>
        </section>

        <header>
          <h2 className="text-[1.7rem] leading-tight font-extrabold text-balance">İşletmeni {CITY.province}&apos;ye tanıt</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {CITY.province}&apos;nin 12 ilçesinde müşteriler seni bulsun, arasın. İşletme hesabı tamamen ücretsiz.
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

        <section aria-labelledby="hazirlik" className="rounded-3xl bg-card p-4">
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
                <span className="relative flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <t.icon className="size-4" aria-hidden />
                </span>
                <span className="mt-2 text-sm font-bold">{t.title}</span>
                <span className="text-xs text-muted-foreground">{t.text}</span>
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

      <BottomDock>
        {note ? <div className="mb-2.5">{note}</div> : null}
        <div className="flex flex-col gap-1.5">
          <Button asChild size="lg" className={BLACK}>
            <Link href={primary.href}>
              {primary.label} <ArrowRight />
            </Link>
          </Button>
          {secondary ? (
            <Button asChild variant="secondary" size="lg">
              <Link href={secondary.href}>
                <secondary.icon /> {secondary.label}
              </Link>
            </Button>
          ) : owned.length === 0 ? (
            <Button asChild variant="ghost" className="text-muted-foreground">
              <Link href={routes.profile.root()}>Şimdi değil</Link>
            </Button>
          ) : null}
        </div>
      </BottomDock>
    </>
  );
}
