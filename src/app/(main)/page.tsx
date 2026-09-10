import Link from "next/link";
import {
  Briefcase,
  Bus,
  ChevronRight,
  Cross,
  Landmark,
  MapPin,
  Megaphone,
  Newspaper,
  Plus,
  Search,
  Store,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_DESCRIPTION, APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { DutyBadge } from "@/components/shared/badges";
import { SectionHeader } from "@/components/shared/section-header";
import { JsonLd } from "@/components/seo/json-ld";

// Temporary home created by the app-shell agent; the home agent rebuilds this page.

type Tone = "amber" | "teal" | "blue" | "green" | "rose" | "violet";

const toneClass: Record<Tone, string> = {
  amber: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
  teal: "bg-brand-soft text-primary",
  blue: "bg-info-soft text-info",
  green: "bg-success-soft text-success",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
};

const QUICK: Array<{ href: string; label: string; icon: LucideIcon; tone: Tone }> = [
  { href: routes.nearby.dutyPharmacies(), label: "Nöbetçi Eczane", icon: Cross, tone: "amber" },
  { href: routes.nearby.root(), label: "Yakınımda", icon: MapPin, tone: "teal" },
  { href: routes.nearby.root("cami"), label: "Camiler", icon: Landmark, tone: "green" },
  { href: routes.nearby.root("durak"), label: "Duraklar", icon: Bus, tone: "blue" },
  { href: routes.nearby.places(), label: "Gezilecek Yerler", icon: Landmark, tone: "violet" },
  { href: routes.listings.root("ikinci-el"), label: "2. El İlanlar", icon: Tag, tone: "rose" },
  { href: routes.listings.root("is-ilanlari"), label: "İş İlanları", icon: Briefcase, tone: "amber" },
  { href: routes.listings.post(), label: "İlan Ver", icon: Plus, tone: "teal" },
  { href: routes.services.root(), label: "Hizmet Al", icon: Wrench, tone: "blue" },
  { href: routes.businesses.root(), label: "Firmalar", icon: Store, tone: "green" },
  { href: routes.content.news(), label: "Gündem", icon: Newspaper, tone: "violet" },
  { href: routes.content.announcements(), label: "Duyurular", icon: Megaphone, tone: "rose" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-7 px-4 pt-2 pb-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: APP_NAME,
          url: SITE_URL,
          description: APP_DESCRIPTION,
          inLanguage: "tr-TR",
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}${routes.search()}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />

      <section>
        <h1 className="text-[1.6rem] leading-tight font-extrabold text-balance">{CITY.name}&apos;de bugün neye ihtiyacın var?</h1>
        <Link
          href={routes.search()}
          className="mt-4 flex h-12 items-center gap-3 rounded-2xl bg-card px-4 text-[15px] text-muted-foreground shadow-soft ring-1 ring-foreground/[0.06] transition-colors hover:bg-muted/50"
        >
          <Search className="size-5 text-primary" aria-hidden />
          Eczane, usta, ilan ya da yer ara
        </Link>
      </section>

      <Link
        href={routes.nearby.dutyPharmacies()}
        className="group flex items-center gap-4 rounded-2xl bg-highlight-soft p-4 ring-1 ring-highlight/30 transition-transform active:scale-[0.99]"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-highlight text-highlight-foreground">
          <Cross className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold">Nöbetçi eczaneler</p>
            <DutyBadge />
          </div>
          <p className="mt-0.5 text-sm text-highlight-foreground/80 dark:text-foreground/75">Nöbet 08:30&apos;da değişir. Şu an açık olanları gör.</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-highlight-foreground/70 transition-transform group-hover:translate-x-0.5 dark:text-foreground/60" aria-hidden />
      </Link>

      <section>
        <SectionHeader title="Hızlı erişim" />
        <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4">
          {QUICK.map((q) => (
            <li key={q.label}>
              <Link href={q.href} className="group flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className={cn("flex size-14 items-center justify-center rounded-2xl transition-transform group-active:scale-95", toneClass[q.tone])}>
                  <q.icon className="size-6" aria-hidden />
                </span>
                <span className="text-xs leading-tight font-semibold">{q.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={routes.business.intro()}
        className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-card transition-transform active:scale-[0.99]"
      >
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold">İşletmen mi var?</p>
          <p className="mt-1 text-sm opacity-90">Ücretsiz işletme hesabı aç, {CITY.name}lilere ulaş.</p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Store className="size-5" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
