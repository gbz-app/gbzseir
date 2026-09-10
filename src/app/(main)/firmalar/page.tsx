import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Store, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { ListSkeleton } from "@/components/shared/skeletons";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, FEATURES, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { slugifyTr, trCompare } from "@/core/tr";
import { FirmsDirectory, type DirectoryChip, type DirectoryItem } from "@/features/business/components/firms-directory";
import { getServiceCategories, listApprovedBusinesses, type DirectoryBusiness, type ServiceCategoryLite } from "@/features/business/lib/queries";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Firmalar",
  description: `${CITY.name}'nin onaylı işletmeleri: temizlik, tadilat, nakliyat, tesisat, elektrik ve daha fazlası. Puanlar, yorumlar ve iletişim bilgileri ${APP_NAME}'de.`,
  alternates: { canonical: routes.businesses.root() },
};

/** Chip keys: top-level service category names + category labels, merged by slug. */
function buildDirectory(businesses: DirectoryBusiness[], categories: ServiceCategoryLite[]): { items: DirectoryItem[]; chips: DirectoryChip[] } {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const items = businesses.map((b) => {
    const keys = new Set<string>();
    const add = (label: string | null | undefined) => {
      const key = slugifyTr(label);
      if (!key || !label) return;
      keys.add(key);
      if (!labels.has(key)) labels.set(key, label);
    };
    for (const id of b.category_ids) {
      const c = byId.get(id);
      add(c?.parent_id ? byId.get(c.parent_id)?.name : c?.name);
    }
    add(b.category_label);
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logo_url: b.logo_url,
      category_label: b.category_label,
      rating_avg: b.rating_avg,
      rating_count: b.rating_count,
      verification_level: b.verification_level,
      vacation_mode: b.vacation_mode,
      neighbourhood_name: b.neighbourhood_name,
      lat: b.lat,
      lng: b.lng,
      keys: [...keys],
    };
  });
  const chips = [...counts.entries()]
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count || trCompare(a.label, b.label));
  return { items, chips };
}

export default async function FirmsPage() {
  let data: { items: DirectoryItem[]; chips: DirectoryChip[] } | null = null;
  try {
    const [businesses, categories] = await Promise.all([listApprovedBusinesses(), getServiceCategories()]);
    data = buildDirectory(businesses, categories);
  } catch {
    data = null;
  }

  return (
    <>
      <PageHeader title="Firmalar" subtitle={`${CITY.name}'nin onaylı işletmeleri`} backHref={routes.services.root()} />
      <div className="flex flex-col gap-6 px-4 py-4">
        {data ? (
          <>
            <JsonLd
              data={{
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: `${CITY.name} firmaları`,
                itemListElement: data.items.slice(0, 50).map((b, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: `${SITE_URL}${routes.businesses.detail(b.slug)}`,
                  name: b.name,
                })),
              }}
            />
            <Suspense fallback={<ListSkeleton count={6} />}>
              <FirmsDirectory items={data.items} chips={data.chips} />
            </Suspense>
          </>
        ) : (
          <ErrorState description="Firmalar şu an yüklenemedi. Biraz sonra tekrar dene." />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={routes.services.root()}
            className="flex items-center gap-3 rounded-2xl bg-info-soft p-4 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-info shadow-soft">
              <Wrench className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-bold">Usta mı arıyorsun?</span>
              <span className="text-muted-foreground">Talebini oluştur, uygun firmalar seni arasın.</span>
            </span>
          </Link>
          {FEATURES.businessApplications ? (
            <Link
              href={routes.business.intro()}
              className="flex items-center gap-3 rounded-2xl bg-brand-soft p-4 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-soft">
                <Store className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block font-bold">İşletmen mi var?</span>
                <span className="text-muted-foreground">Ücretsiz işletme sayfanı aç.</span>
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
