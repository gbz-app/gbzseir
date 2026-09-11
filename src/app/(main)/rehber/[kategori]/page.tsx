import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { GUIDE_SECTIONS } from "@/features/guide/lib/constants";
import { getGuideCounts, getInstitutionCategories } from "@/features/guide/lib/queries";
import { buildChipDefs, loadGuideList } from "@/features/guide/components/entries";
import { GuideListBrowserFromUrl, GuideListFallback, type GuideListBrowserProps } from "@/features/guide/components/guide-list-browser";
import { GUIDE_EXTRA_LIST_SLUGS, resolveGuideList, type GuideListConfig } from "@/features/guide/components/list-config";
import type { GuideCounts } from "@/features/guide/lib/types";

export const revalidate = 3600;

/** Sections and combined lists are built ahead; institution category slugs (/rehber/nufus) render on first visit. */
export function generateStaticParams() {
  return [...GUIDE_EXTRA_LIST_SLUGS, ...GUIDE_SECTIONS.map((s) => s.slug)].map((kategori) => ({ kategori }));
}

type Props = { params: Promise<{ kategori: string }> };

function decode(v: string): string {
  try {
    return decodeURIComponent(v).trim().toLowerCase();
  } catch {
    return v.trim().toLowerCase();
  }
}

async function resolve(params: Props["params"]) {
  const slug = decode((await params).kategori);
  const defs = await getInstitutionCategories();
  return { slug, cfg: slug.length <= 60 ? resolveGuideList(slug, defs) : null };
}

/** Visible rows of a section or preset category (null for the combined lists, which always have rows). */
function listCount(cfg: GuideListConfig, counts: GuideCounts): number | null {
  if (cfg.preset) return counts.byInstitutionCategory[cfg.preset] ?? 0;
  if (GUIDE_SECTIONS.some((s) => s.slug === cfg.slug)) return counts.bySection[cfg.slug] ?? 0;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, cfg } = await resolve(params);
  if (!cfg) return { title: "Bulunamadı", robots: { index: false } };
  const name = cfg.presetLabel ?? cfg.title;
  const counts = await getGuideCounts();
  // An empty list (e.g. /rehber/sahil before any row exists) stays out of search results.
  const empty = counts.ok && listCount(cfg, counts) === 0;
  return {
    title: `${name} - ${CITY.province} Şehir Rehberi`,
    description: cfg.presetLabel
      ? `${CITY.province}'deki${cfg.presetLabel.toLocaleLowerCase("tr-TR")} kayıtları: adres, telefon, harita ve yol tarifi.`
      : `${cfg.description} Adres, telefon, harita ve yol tarifi.`,
    alternates: { canonical: routes.guide.category(slug) },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * /rehber/[kategori]: one guide list (section, combined list or institution category) as a map-first view: the map with
 * the category's pins and the draggable list sheet (like /yakinimda). No top bar; the back button floats on the map.
 */
export default async function GuideListPage({ params }: Props) {
  const { slug, cfg } = await resolve(params);
  if (!cfg) notFound();

  const [{ entries, ok, labels }, counts] = await Promise.all([loadGuideList(cfg), cfg.bankSwitch ? getGuideCounts() : Promise.resolve(null)]);
  const props: GuideListBrowserProps = {
    config: {
      slug: cfg.slug,
      title: cfg.title,
      kind: cfg.kind,
      chip: cfg.chip,
      chipParam: cfg.chipParam,
      preset: cfg.preset,
      ownership: cfg.ownership,
      bankSwitch: cfg.bankSwitch,
    },
    entries,
    chips: buildChipDefs(cfg, entries, labels),
    ok,
    bankCounts: counts ? { atm: counts.byKind.atm ?? 0, bank: counts.byKind.bank ?? 0 } : undefined,
  };

  const listed = (cfg.preset ? entries.filter((e) => e.cat === cfg.preset) : entries).slice(0, 50);
  const jsonLd: Array<Record<string, unknown>> = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana sayfa", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Şehir Rehberi", item: `${SITE_URL}${routes.guide.root()}` },
        { "@type": "ListItem", position: 3, name: cfg.presetLabel ?? cfg.title, item: `${SITE_URL}${routes.guide.category(slug)}` },
      ],
    },
  ];
  if (listed.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${CITY.province} ${cfg.presetLabel ?? cfg.title}`,
      itemListElement: listed.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.name, url: `${SITE_URL}${e.href}` })),
    });
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <h1 className="sr-only">{cfg.presetLabel ?? cfg.title}</h1>
      {/* Keeps the map below the status bar / notch (the page has no top bar). */}
      <div aria-hidden className="pt-safe" />
      {/* The server paints the first rows with the path's filters; the URL's ?alt= / ?q= ... are applied on the client. */}
      <Suspense fallback={<GuideListFallback {...props} />}>
        <GuideListBrowserFromUrl {...props} />
      </Suspense>
    </>
  );
}
