import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getServiceCatalog } from "@/features/services/data";
import { servicePickerData } from "@/features/services/util";
import { RequestStart } from "@/features/services/components/request-start";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Hizmetler",
  description: `${CITY.province}'de ev temizliği, boya badana, nakliyat, kombi bakımı, tesisat ve daha fazlası için ücretsiz talep oluştur; uygun onaylı firmalar seninle ilgilensin.`,
  alternates: { canonical: routes.services.root() },
};

/** F1: step 1 of the service request (search / pick a service). Every generic "hizmet al" entry lands here. */
export default async function ServicesPage() {
  const catalog = await getServiceCatalog();

  return (
    <>
      <RequestStart data={servicePickerData(catalog)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${CITY.province} hizmet kategorileri`,
          itemListElement: catalog.parents.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: p.name,
            url: `${SITE_URL}${routes.services.category(p.slug)}`,
          })),
        }}
      />
    </>
  );
}
