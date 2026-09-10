import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { MenuManager } from "@/features/business/components/menu-manager";
import { WrongVerticalNote } from "@/features/business/components/owner-gate";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { qrForUrl } from "@/features/business/lib/qr";
import { getBusinessMenu } from "@/features/business/lib/vertical-queries";
import { hasMenu, resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "Menü ve QR menü", robots: { index: false } };

/** H5 - Menü yönetimi + QR menü (kafe, restoran, yemek). */
export default async function OwnerMenuPage() {
  await requireProfile(routes.business.menu());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());

  const vertical = resolveVertical(b.vertical, b.kinds);
  if (!hasMenu(vertical)) {
    return (
      <>
        <PageHeader title="Menü ve QR menü" subtitle={b.name} backHref={routes.business.root()} />
        <div className="px-4 pt-5">
          <WrongVerticalNote text="Menü ve QR menü; yemek, restoran ve kafe işletmeleri içindir. İşletme türünü değiştirirsen bu bölüm açılır." />
        </div>
      </>
    );
  }

  const menuUrl = `${SITE_URL}${routes.businesses.menu(b.slug)}`;
  const [menu, qr] = await Promise.all([getBusinessMenu(b.id).catch(() => []), qrForUrl(menuUrl)]);

  return (
    <>
      <PageHeader title="Menü ve QR menü" subtitle={b.name} backHref={routes.business.root()} />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-10">
        <section className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]" aria-label="QR menü">
          <div className="size-28 shrink-0 rounded-2xl bg-white p-2 ring-1 ring-foreground/10 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
          <div className="min-w-0">
            <p className="font-semibold">QR menün hazır</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Masalara koy; müşteri telefon kamerasıyla okutup menüyü açar.</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button asChild size="sm">
                <a href={qr.png} download={`${b.slug}-qr-menu.png`}>
                  <Download /> İndir
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={routes.business.menuQr()}>
                  <Printer /> Yazdır
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={routes.businesses.menu(b.slug)}>
                  <ExternalLink /> Aç
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <MenuManager businessId={b.id} initial={menu} />
      </div>
    </>
  );
}
