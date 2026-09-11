import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { findCategory, getFirmsForCategories, getServiceCatalog } from "@/features/services/data";
import { COMING_SOON_LABEL } from "@/features/services/labels";
import { FirmCard, HowItWorks } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";

export const revalidate = 600;

type Props = { params: Promise<{ kategori: string }> };

export async function generateStaticParams(): Promise<Array<{ kategori: string }>> {
  try {
    const catalog = await getServiceCatalog();
    return catalog.parents.map((p) => ({ kategori: p.slug }));
  } catch {
    return [];
  }
}

function describe(name: string, description: string | null, subNames: string[], maxProviders: number): string {
  const list = subNames.slice(0, 4).join(", ");
  return `${description ? `${description}. ` : ""}Gebze'de ${list || name} için ücretsiz talep oluştur; en fazla ${maxProviders} onaylı firma seninle ilgilensin, fiyat tahminlerini gör ve dilediğini ara.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kategori } = await params;
  const found = await findCategory(kategori).catch(() => null);
  if (!found) return { title: "Hizmet bulunamadı", robots: { index: false } };
  if (found.kind === "sub") return { title: found.category.name, robots: { index: false } };
  const c = found.category;
  const title = `Gebze ${c.name} Hizmetleri`;
  const description = describe(c.name, c.description, c.children.map((s) => s.name), c.max_providers);
  const url = routes.services.category(c.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "tr_TR" },
  };
}

/** F2: parent category page (sub-categories -> wizard, up to 5 approved firms, JSON-LD Service). */
export default async function ServiceCategoryPage({ params }: Props) {
  const { kategori } = await params;
  const found = await findCategory(kategori);
  if (!found) notFound();
  if (found.kind === "sub") redirect(routes.services.request(found.category.slug));
  const c = found.category;
  const firms = await getFirmsForCategories([c.id, ...c.children.map((s) => s.id)], 5);
  const url = `${SITE_URL}${routes.services.category(c.slug)}`;
  const description = describe(c.name, c.description, c.children.map((s) => s.name), c.max_providers);
  const firstSub = c.children[0];

  return (
    <>
      <PageHeader title={c.name} subtitle="Hizmetler" backHref={routes.services.root()} />
      <div className="flex flex-col gap-7 px-4 pt-4 pb-nav">
        <section className="flex items-start gap-4 rounded-3xl bg-brand-soft p-5">
          <ServiceIconBubble name={c.icon} size="lg" className="bg-card" />
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-extrabold text-balance">Gebze {c.name} Hizmetleri</h2>
            {c.description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.description}.</p> : null}
            <p className="mt-2 text-sm font-medium">Ücretsiz talep oluştur, en fazla {c.max_providers} firma seninle ilgilensin.</p>
          </div>
        </section>

        <section aria-labelledby="alt-hizmetler">
          <SectionHeader
            title={<span id="alt-hizmetler">Hangi hizmet lazım?</span>}
            description="Seç, birkaç soruyu cevapla, talebin firmalara gitsin."
            className="mb-3"
          />
          {c.children.length ? (
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
              {c.children.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={routes.services.request(s.slug)}
                    className="flex min-h-18 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted"
                  >
                    <ServiceIconBubble name={s.icon} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{s.name}</span>
                      {s.description ? <span className="block text-xs leading-snug text-muted-foreground">{s.description}</span> : null}
                    </span>
                    {s.provider_count === 0 ? <Badge variant="secondary">{COMING_SOON_LABEL}</Badge> : null}
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Bu kategoride şu an aktif hizmet yok.</p>
          )}
        </section>

        <section aria-labelledby="kategori-firmalari">
          <SectionHeader
            title={<span id="kategori-firmalari">{c.name} firmaları</span>}
            href={routes.businesses.root()}
            linkLabel="Tüm firmalar"
            className="mb-3"
          />
          {firms.length ? (
            <ul className="flex flex-col gap-2.5">
              {firms.map((f) => (
                <li key={f.id}>
                  <FirmCard firm={f} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-5 py-7 text-center shadow-soft ring-1 ring-foreground/[0.06]">
              <ClipboardList className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-semibold">Bu kategoride henüz listelenen firma yok</p>
              <p className="max-w-xs text-sm text-muted-foreground">Talebini oluştur; ekibimiz senin için uygun firmaları bulsun.</p>
              {firstSub ? (
                <Button asChild className="mt-2">
                  <Link href={routes.services.request(firstSub.slug)}>Talep oluştur</Link>
                </Button>
              ) : null}
            </div>
          )}
        </section>

        <HowItWorks maxProviders={c.max_providers} />
      </div>

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Service",
            name: `Gebze ${c.name} Hizmetleri`,
            serviceType: c.name,
            description,
            url,
            areaServed: { "@type": "City", name: "Gebze", containedInPlace: { "@type": "AdministrativeArea", name: "Kocaeli" } },
            ...(firms.length
              ? {
                  provider: firms.map((f) => ({
                    "@type": "LocalBusiness",
                    name: f.name,
                    url: `${SITE_URL}${routes.businesses.detail(f.slug)}`,
                    ...(f.logo_url ? { image: f.logo_url } : {}),
                    ...(f.rating_count && f.rating_avg
                      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: f.rating_avg, reviewCount: f.rating_count, bestRating: 5 } }
                      : {}),
                  })),
                }
              : {}),
            hasOfferCatalog: {
              "@type": "OfferCatalog",
              name: c.name,
              itemListElement: c.children.map((s) => ({
                "@type": "Offer",
                itemOffered: { "@type": "Service", name: s.name, ...(s.description ? { description: s.description } : {}) },
              })),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Ana sayfa", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Hizmetler", item: `${SITE_URL}${routes.services.root()}` },
              { "@type": "ListItem", position: 3, name: c.name, item: url },
            ],
          },
        ]}
      />
    </>
  );
}
