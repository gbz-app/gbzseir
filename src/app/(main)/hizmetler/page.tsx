import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { JsonLd } from "@/components/seo/json-ld";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getServiceCatalog } from "@/features/services/data";
import { HowItWorks } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";
import { ServiceSearch, type ServiceSearchItem } from "@/features/services/components/service-search";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Hizmetler",
  description:
    "Gebze'de ev temizliği, boya badana, nakliyat, kombi bakımı, tesisat ve daha fazlası için ücretsiz talep oluştur; en fazla 5 onaylı firma seninle ilgilensin.",
  alternates: { canonical: routes.services.root() },
};

/** F1: service search, popular services, all categories, how it works. */
export default async function ServicesPage() {
  const catalog = await getServiceCatalog();
  const popular = catalog.subs.filter((s) => s.popular);
  const items: ServiceSearchItem[] = catalog.subs.map((s) => ({
    slug: s.slug,
    name: s.name,
    icon: s.icon,
    parentName: s.parent.name,
    terms: [...s.synonyms, s.parent.name, ...s.parent.synonyms, s.description ?? ""],
  }));

  return (
    <div className="flex flex-col gap-6 px-4 pt-3 pb-nav">
      <header>
        <h1 className="text-[1.65rem] leading-tight font-extrabold text-balance">Gebze&apos;de usta ve hizmet bul</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
          Birkaç soruyu cevapla, uygun firmalar seninle ilgilensin. Ücretsiz ve zahmetsiz.
        </p>
      </header>

      <ServiceSearch items={items}>
        <div className="flex flex-col gap-8">
          {popular.length ? (
            <section aria-labelledby="populer-hizmetler">
              <SectionHeader title={<span id="populer-hizmetler">Popüler hizmetler</span>} className="mb-3" />
              <ul className="grid grid-cols-2 gap-3">
                {popular.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={routes.services.request(s.slug)}
                      className="flex min-h-18 items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.06] transition-[box-shadow,transform] outline-none hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
                    >
                      <ServiceIconBubble name={s.icon} size="sm" />
                      <span className="min-w-0 text-sm leading-snug font-bold text-balance">{s.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="tum-kategoriler">
            <SectionHeader title={<span id="tum-kategoriler">Tüm kategoriler</span>} className="mb-3" />
            <Accordion type="single" collapsible className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
              {catalog.parents.map((p) => (
                <AccordionItem key={p.slug} value={p.slug} className="px-4">
                  <AccordionTrigger className="min-h-16 items-center gap-3 py-3 hover:no-underline">
                    <ServiceIconBubble name={p.icon} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold">{p.name}</span>
                      {p.description ? <span className="block truncate text-xs font-normal text-muted-foreground">{p.description}</span> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <ul className="flex flex-col">
                      {p.children.map((s) => (
                        <li key={s.slug}>
                          <Link
                            href={routes.services.request(s.slug)}
                            className="-mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 !no-underline transition-colors hover:bg-muted"
                          >
                            <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{s.name}</span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={routes.services.category(p.slug)}
                      className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold !text-primary"
                    >
                      Tüm {p.name} hizmetleri
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <HowItWorks />

          <Link
            href={routes.businesses.root()}
            className="flex min-h-16 items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 font-semibold text-primary transition-colors outline-none hover:bg-brand-soft/80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Store className="size-5 shrink-0" aria-hidden />
            <span className="flex-1">Gebze&apos;deki hizmet firmaları</span>
            <ChevronRight className="size-5 shrink-0" aria-hidden />
          </Link>
        </div>
      </ServiceSearch>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Gebze hizmet kategorileri",
          itemListElement: catalog.parents.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: p.name,
            url: `${SITE_URL}${routes.services.category(p.slug)}`,
          })),
        }}
      />
    </div>
  );
}
