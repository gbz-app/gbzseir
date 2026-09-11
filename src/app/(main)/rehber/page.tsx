import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Castle,
  ChevronRight,
  Drama,
  Flower2,
  GraduationCap,
  Hospital,
  Landmark,
  Mail,
  Scale,
  School,
  ShoppingBasket,
  Siren,
  Stamp,
  TrainFront,
  Trees,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/components/seo/json-ld";
import { CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getEmergencyNumbers, getGuideCounts, getInstitutionCategories } from "@/features/guide/lib/queries";
import { EmergencyList } from "@/features/guide/components/emergency-list";
import { GuideHubSearch, HubBackButton } from "@/features/guide/components/guide-hub";
import { SCHOOL_CATEGORIES } from "@/features/guide/components/list-config";
import { KIND_META, OSM_COPYRIGHT_URL } from "@/features/nearby/config";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Şehir Rehberi - ${CITY.province}`,
  description: `${CITY.province}'de resmî kurumlar, okullar, hastaneler, noterler, ATM ve bankalar, akaryakıt ve şarj istasyonları, tarihi yerler ve acil numaralar: adres, telefon ve yol tarifi.`,
  alternates: { canonical: routes.guide.root() },
};

/** Icon chip tones (light + dark) of the rows without a pin kind of their own. */
const TONE = {
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  fuchsia: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  lime: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
} as const;

/** One list row; `count` null = no count (links to the /yakinimda map). */
type Row = { href: string; label: string; icon: LucideIcon; tone: string; count: number | null };
type Group = { id: string; title: string; rows: Row[] };

const SECTION_TITLE = "px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

const sum = (map: Record<string, number>, keys: readonly string[]) => keys.reduce((n, k) => n + (map[k] ?? 0), 0);

function GuideRow({ row, showCount }: { row: Row; showCount: boolean }) {
  return (
    <Link
      href={row.href}
      className="flex min-h-14 items-center gap-3 rounded-2xl px-2.5 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", row.tone)} aria-hidden>
        <row.icon className="size-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{row.label}</span>
      {showCount && row.count !== null ? <span className="shrink-0 text-sm font-medium text-muted-foreground tabular-nums">{row.count}</span> : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Şehir Rehberi hub: search, a minimalist grouped list of categories (each opens its map view), emergency numbers, credits. */
export default async function GuideHubPage() {
  const [counts, emergency, institutionDefs] = await Promise.all([getGuideCounts(), getEmergencyNumbers(), getInstitutionCategories()]);
  const inst = counts.byInstitutionCategory;
  const place = counts.byPlaceCategory;
  const kind = counts.byKind;
  const section = counts.bySection;
  const showCounts = counts.ok;

  const listCounts: Record<string, number> = {
    ...inst,
    ...section,
    kurumlar: kind.institution ?? 0,
    okullar: sum(inst, SCHOOL_CATEGORIES),
    "muzeler-ve-kultur": sum(place, ["muze", "kultur"]),
    "parklar-ve-doga": sum(place, ["park", "tabiat_parki", "doga", "sahil"]),
  };

  const cat = (slug: string) => routes.guide.category(slug);
  const groups: Group[] = [
    {
      id: "rehber-kurumlar",
      title: "Resmî kurumlar",
      rows: [
        { href: cat("kurumlar"), label: "Tüm resmî kurumlar", icon: Building2, tone: KIND_META.institution.tone, count: listCounts.kurumlar },
        { href: cat("kamu"), label: "Belediye ve kamu", icon: Landmark, tone: TONE.indigo, count: section.kamu ?? 0 },
        { href: cat("guvenlik"), label: "Emniyet, jandarma, itfaiye", icon: Siren, tone: TONE.red, count: section.guvenlik ?? 0 },
        { href: cat("adalet"), label: "Adliye ve icra", icon: Scale, tone: TONE.slate, count: section.adalet ?? 0 },
        { href: cat("noter"), label: "Noterler", icon: Stamp, tone: TONE.slate, count: inst.noter ?? 0 },
        { href: cat("saglik"), label: "Hastaneler ve sağlık", icon: Hospital, tone: TONE.rose, count: section.saglik ?? 0 },
        { href: cat("okullar"), label: "Okullar", icon: School, tone: TONE.sky, count: listCounts.okullar },
        { href: cat("universite"), label: "Üniversiteler", icon: GraduationCap, tone: TONE.violet, count: inst.universite ?? 0 },
        { href: cat("ptt"), label: "PTT şubeleri", icon: Mail, tone: TONE.yellow, count: section.ptt ?? 0 },
      ],
    },
    {
      id: "rehber-gunluk",
      title: "Günlük ihtiyaçlar",
      rows: [
        { href: cat("atm"), label: "ATM", icon: KIND_META.atm.icon, tone: KIND_META.atm.tone, count: kind.atm ?? 0 },
        { href: cat("banka"), label: "Banka şubeleri", icon: KIND_META.bank.icon, tone: KIND_META.bank.tone, count: kind.bank ?? 0 },
        { href: cat("akaryakit"), label: "Akaryakıt istasyonları", icon: KIND_META.fuel.icon, tone: KIND_META.fuel.tone, count: kind.fuel ?? 0 },
        { href: cat("sarj"), label: "Şarj istasyonları", icon: KIND_META.ev_charge.icon, tone: KIND_META.ev_charge.tone, count: kind.ev_charge ?? 0 },
      ],
    },
    {
      id: "rehber-harita",
      title: "Haritada bul",
      rows: [
        { href: routes.nearby.dutyPharmacies(), label: "Nöbetçi eczane", icon: KIND_META.duty.icon, tone: KIND_META.duty.tone, count: null },
        { href: routes.nearby.root("cami"), label: "Camiler", icon: KIND_META.mosque.icon, tone: KIND_META.mosque.tone, count: null },
        { href: routes.nearby.root("durak"), label: "Duraklar", icon: KIND_META.bus_stop.icon, tone: KIND_META.bus_stop.tone, count: null },
        { href: routes.nearby.root("taksi"), label: "Taksi durakları", icon: KIND_META.taxi.icon, tone: KIND_META.taxi.tone, count: null },
      ],
    },
    {
      id: "rehber-gezi",
      title: "Gezi ve kültür",
      rows: [
        { href: cat("tarihi"), label: "Tarihi yerler", icon: Castle, tone: TONE.amber, count: place.tarihi ?? 0 },
        { href: cat("muzeler-ve-kultur"), label: "Müzeler ve kültür", icon: Drama, tone: TONE.fuchsia, count: listCounts["muzeler-ve-kultur"] },
        { href: cat("parklar-ve-doga"), label: "Parklar ve doğa", icon: Trees, tone: TONE.lime, count: listCounts["parklar-ve-doga"] },
        { href: cat("spor"), label: "Spor tesisleri", icon: Trophy, tone: TONE.yellow, count: place.spor ?? 0 },
        { href: cat("pazar"), label: "Pazar yerleri", icon: ShoppingBasket, tone: TONE.green, count: place.pazar ?? 0 },
        { href: cat("mezarlik"), label: "Mezarlıklar", icon: Flower2, tone: TONE.slate, count: place.mezarlik ?? 0 },
        { href: cat("ulasim"), label: "Tren, otogar ve iskele", icon: TrainFront, tone: TONE.blue, count: place.ulasim ?? 0 },
      ],
    },
  ];
  // With working counts, empty categories stay out of the list.
  const shown = groups.map((g) => ({ ...g, rows: g.rows.filter((r) => r.count === null || !showCounts || r.count > 0) })).filter((g) => g.rows.length > 0);

  const listed = shown.flatMap((g) => g.rows.filter((r) => r.count !== null));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${CITY.province} Şehir Rehberi`,
    itemListElement: listed.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.label, url: `${SITE_URL}${r.href}` })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="flex flex-col gap-5 px-4 pt-safe pb-10">
        <header>
          <div className="flex h-(--topbar-h) items-center">
            <HubBackButton />
          </div>
          <h1 className="mt-1 text-[2rem] leading-tight font-bold tracking-tight">Şehir Rehberi</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">Kurum, okul, ATM ve gezilecek yerler tek listede. Birine dokun, haritada gör.</p>
        </header>

        <GuideHubSearch counts={listCounts} institutionDefs={institutionDefs}>
          <div className="flex flex-col gap-6">
            {shown.map((g) => (
              <section key={g.id} aria-labelledby={g.id}>
                <h2 id={g.id} className={cn(SECTION_TITLE, "mb-2")}>
                  {g.title}
                </h2>
                <ul className="flex flex-col rounded-3xl bg-card p-1.5">
                  {g.rows.map((r) => (
                    <li key={r.href}>
                      <GuideRow row={r} showCount={showCounts} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section aria-labelledby="rehber-acil">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="rehber-acil" className={SECTION_TITLE}>
                  Acil numaralar
                </h2>
                <Link href={routes.content.emergency()} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                  Tümü
                </Link>
              </div>
              <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800 dark:bg-red-500/10 dark:text-red-200">
                Hayati tehlike varsa beklemeden <strong>112</strong>&apos;yi ara. Aramalar ücretsizdir.
              </p>
              <EmergencyList numbers={emergency} />
            </section>

            <footer className="rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p>
                Harita verisi{" "}
                <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
                  © OpenStreetMap katkıcıları
                </a>
              </p>
              <p className="mt-1">Resmî kurum bilgileri resmî sitelerden derlendi; son kontrol tarihi her kayıtta yazar.</p>
            </footer>
          </div>
        </GuideHubSearch>
      </div>
    </>
  );
}
