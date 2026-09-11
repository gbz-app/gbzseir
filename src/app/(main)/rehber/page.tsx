import type { Metadata } from "next";
import Link from "next/link";
import {
  Banknote,
  Castle,
  ChevronRight,
  Drama,
  EvCharger,
  Fuel,
  GraduationCap,
  Hospital,
  Landmark,
  School,
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
import { GUIDE_HUBS, GUIDE_SECTIONS } from "@/features/guide/lib/constants";
import { getEmergencyNumbers, getGuideCounts, getInstitutionCategories } from "@/features/guide/lib/queries";
import { EmergencyList } from "@/features/guide/components/emergency-list";
import { GuideHubSearch, HubBackButton } from "@/features/guide/components/guide-hub";
import { SCHOOL_CATEGORIES } from "@/features/guide/components/list-config";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { OSM_COPYRIGHT_URL } from "@/features/nearby/config";
import type { MarkerKind } from "@/features/nearby/types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Şehir Rehberi - ${CITY.name}`,
  description: `${CITY.name}'de resmî kurumlar, okullar, hastaneler, noterler, ATM ve bankalar, akaryakıt ve şarj istasyonları, tarihi yerler ve acil numaralar: adres, telefon ve yol tarifi.`,
  alternates: { canonical: routes.guide.root() },
};

type Tile = { href: string; label: string; icon: LucideIcon; tone: string; count: number };

const sum = (map: Record<string, number>, keys: readonly string[]) => keys.reduce((n, k) => n + (map[k] ?? 0), 0);

function CategoryTile({ tile, showCount }: { tile: Tile; showCount: boolean }) {
  return (
    <Link
      href={tile.href}
      className="flex min-h-[7.25rem] flex-col justify-between gap-3 rounded-3xl bg-card p-3 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
    >
      <span className={cn("flex size-11 items-center justify-center rounded-2xl", tile.tone)}>
        <tile.icon className="size-[22px]" strokeWidth={1.9} aria-hidden />
      </span>
      <span>
        <span className="block text-[13px] leading-tight font-semibold text-balance">{tile.label}</span>
        {showCount ? <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{tile.count} kayıt</span> : null}
      </span>
    </Link>
  );
}

const MAP_LINKS: Array<{ href: string; label: string; kind: MarkerKind }> = [
  { href: routes.nearby.dutyPharmacies(), label: "Nöbetçi eczane", kind: "duty" },
  { href: routes.nearby.root("cami"), label: "Camiler", kind: "mosque" },
  { href: routes.nearby.root("durak"), label: "Duraklar", kind: "bus_stop" },
  { href: routes.nearby.root("taksi"), label: "Taksi", kind: "taxi" },
];

/** Şehir Rehberi hub: search, category tiles, map shortcuts, every section, emergency numbers and credits. */
export default async function GuideHubPage() {
  const [counts, emergency, institutionDefs] = await Promise.all([getGuideCounts(), getEmergencyNumbers(), getInstitutionCategories()]);
  const inst = counts.byInstitutionCategory;
  const place = counts.byPlaceCategory;
  const kind = counts.byKind;

  const listCounts: Record<string, number> = {
    ...inst,
    ...counts.bySection,
    kurumlar: kind.institution ?? 0,
    okullar: sum(inst, SCHOOL_CATEGORIES),
    "muzeler-ve-kultur": sum(place, ["muze", "kultur"]),
    "parklar-ve-doga": sum(place, ["park", "tabiat_parki", "doga", "sahil"]),
  };

  const tiles: Tile[] = [
    { href: routes.guide.category("kurumlar"), label: "Resmî kurumlar", icon: Landmark, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", count: listCounts.kurumlar },
    { href: routes.guide.category("okullar"), label: "Okullar", icon: School, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", count: listCounts.okullar },
    { href: routes.guide.category("saglik"), label: "Sağlık kurumları", icon: Hospital, tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300", count: counts.bySection.saglik ?? 0 },
    { href: routes.guide.category("universite"), label: "Üniversiteler", icon: GraduationCap, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", count: inst.universite ?? 0 },
    { href: routes.guide.category("noter"), label: "Noterler", icon: Stamp, tone: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300", count: inst.noter ?? 0 },
    { href: routes.guide.category("atm"), label: "ATM ve bankalar", icon: Banknote, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", count: (kind.atm ?? 0) + (kind.bank ?? 0) },
    { href: routes.guide.category("akaryakit"), label: "Akaryakıt", icon: Fuel, tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", count: kind.fuel ?? 0 },
    { href: routes.guide.category("sarj"), label: "Şarj istasyonları", icon: EvCharger, tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", count: kind.ev_charge ?? 0 },
    { href: routes.guide.category("tarihi"), label: "Tarihi yerler", icon: Castle, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", count: place.tarihi ?? 0 },
    { href: routes.guide.category("muzeler-ve-kultur"), label: "Müzeler ve kültür", icon: Drama, tone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", count: listCounts["muzeler-ve-kultur"] },
    { href: routes.guide.category("parklar-ve-doga"), label: "Parklar ve doğa", icon: Trees, tone: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300", count: listCounts["parklar-ve-doga"] },
    { href: routes.guide.category("spor"), label: "Spor tesisleri", icon: Trophy, tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300", count: place.spor ?? 0 },
    { href: routes.guide.category("ulasim"), label: "Ulaşım", icon: TrainFront, tone: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", count: place.ulasim ?? 0 },
  ];
  const showCounts = counts.ok;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${CITY.name} Şehir Rehberi`,
    itemListElement: tiles.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.label, url: `${SITE_URL}${t.href}` })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="flex flex-col gap-6 px-4 pt-safe pb-10">
        <header>
          <div className="flex h-(--topbar-h) items-center">
            <HubBackButton />
          </div>
          <h1 className="mt-1 text-[2rem] leading-tight font-bold tracking-tight">Şehir Rehberi</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {CITY.name}&apos;de resmî kurumlar, okullar, sağlık, ATM, akaryakıt ve gezilecek yerler tek yerde.
          </p>
        </header>

        <GuideHubSearch counts={listCounts} institutionDefs={institutionDefs}>
          <div className="flex flex-col gap-8">
            <section aria-labelledby="rehber-kategoriler">
              <h2 id="rehber-kategoriler" className="sr-only">
                Kategoriler
              </h2>
              <ul className="grid grid-cols-3 gap-2.5">
                {tiles.map((t) => (
                  <li key={t.href}>
                    <CategoryTile tile={t} showCount={showCounts} />
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="rehber-harita">
              <h2 id="rehber-harita" className="mb-3 text-lg font-semibold">
                Haritada bul
              </h2>
              <ul className="grid grid-cols-2 gap-2.5">
                {MAP_LINKS.map((m) => (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      className="flex min-h-16 items-center gap-3 rounded-3xl bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
                    >
                      <KindIcon kind={m.kind} size="sm" />
                      <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold">{m.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="rehber-tumu">
              <h2 id="rehber-tumu" className="mb-3 text-lg font-semibold">
                Tüm kategoriler
              </h2>
              <div className="flex flex-col gap-4">
                {GUIDE_HUBS.map((hub) => {
                  const sections = GUIDE_SECTIONS.filter((s) => s.hub === hub.key && (!showCounts || (counts.bySection[s.slug] ?? 0) > 0));
                  if (!sections.length) return null;
                  return (
                    <div key={hub.key}>
                      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{hub.title}</p>
                      <ul className="flex flex-wrap gap-2">
                        {sections.map((s) => (
                          <li key={s.slug}>
                            <Link
                              href={routes.guide.category(s.slug)}
                              className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
                            >
                              <s.icon className="size-4 text-primary" aria-hidden />
                              {s.label}
                              {showCounts ? <span className="text-xs font-medium text-muted-foreground tabular-nums">{counts.bySection[s.slug] ?? 0}</span> : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="rehber-acil">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="rehber-acil" className="text-lg font-semibold">
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
