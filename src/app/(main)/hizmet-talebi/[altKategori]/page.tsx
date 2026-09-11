import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/core/routes";
import { findCategory, getPublishedFlow, getServiceCatalog } from "@/features/services/data";
import { servicePickerData } from "@/features/services/util";
import { RequestWizard } from "@/features/services/components/request-wizard";

export const revalidate = 600;

type Props = { params: Promise<{ altKategori: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { altKategori } = await params;
  const found = await findCategory(altKategori).catch(() => null);
  if (!found || found.kind !== "sub") return { title: "Hizmet talebi", robots: { index: false } };
  const c = found.category;
  return {
    title: `${c.name} talebi oluştur`,
    description: `Gebze'de ${c.name.toLocaleLowerCase("tr-TR")} için birkaç soruyu cevapla; en fazla ${c.max_providers} uygun firma seninle ilgilensin.`,
    robots: { index: false, follow: true },
  };
}

/**
 * F3/F4: request wizard for a sub-category (question flow + system steps). The picker payload is always sent:
 * when the URL has ?sec=1 (started from /hizmetler) the wizard shows the service picker as step 1.
 */
export default async function ServiceRequestPage({ params }: Props) {
  const { altKategori } = await params;
  const found = await findCategory(altKategori);
  if (!found) notFound();
  if (found.kind === "parent") redirect(routes.services.category(found.category.slug));
  const sub = found.category;
  const [flow, catalog] = await Promise.all([getPublishedFlow(sub.id), getServiceCatalog()]);
  return (
    <RequestWizard
      key={sub.slug}
      picker={servicePickerData(catalog)}
      category={{
        id: sub.id,
        slug: sub.slug,
        name: sub.name,
        icon: sub.icon,
        parentName: found.parent.name,
        parentSlug: found.parent.slug,
        maxProviders: sub.max_providers,
        autoDispatch: sub.auto_dispatch,
      }}
      schema={flow?.schema ?? { steps: [] }}
    />
  );
}
