import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { APP_NAME, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { qrForUrl } from "@/features/business/lib/qr";

export const metadata: Metadata = { title: "QR menü yazdır", robots: { index: false } };

/** Printable table card: business name + big QR code + short instruction. */
export default async function OwnerMenuQrPage() {
  await requireProfile(routes.business.menuQr());
  const b = await getOwnerBusiness();
  if (!b || b.status !== "approved") redirect(routes.business.root());
  const menuUrl = `${SITE_URL}${routes.businesses.menu(b.slug)}`;
  const { svg } = await qrForUrl(menuUrl);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="QR menü yazdır" subtitle={b.name} backHref={routes.business.menu()} hideBottomNav />
      </div>
      <div className="flex flex-col items-center gap-6 px-4 pt-6 pb-16">
        <article className="flex w-full max-w-sm flex-col items-center rounded-[2rem] bg-white p-8 text-center text-[#15121f] shadow-card ring-1 ring-black/10 print:shadow-none print:ring-0">
          <p className="text-sm font-semibold tracking-[0.2em] text-[#6d4fd8] uppercase">Menü</p>
          <h1 className="mt-2 text-2xl leading-tight font-semibold text-balance">{b.name}</h1>
          <div className="mt-6 w-full max-w-[16rem] [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-6 text-[15px] leading-relaxed">Menüyü görmek için telefonunun kamerasıyla okut.</p>
          <p className="mt-2 text-xs break-all text-black/50">{menuUrl.replace(/^https?:\/\//, "")}</p>
          <p className="mt-5 text-xs font-semibold text-black/40">{APP_NAME} QR Menü</p>
        </article>
        <PrintButton className="w-full max-w-sm print:hidden" />
      </div>
    </>
  );
}
