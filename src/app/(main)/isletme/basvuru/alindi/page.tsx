import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BedDouble, ChevronRight, CircleCheck, ImagePlus, PartyPopper, Pencil, QrCode, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomDock } from "@/components/shared/bottom-dock";
import { PageHeader } from "@/components/shared/page-header";
import { APP_NAME } from "@/config/site";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "İşletmen yayında", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type NextStep = { icon: LucideIcon; title: string; text: string; href: string };

function StepRow({ step }: { step: NextStep }) {
  return (
    <li>
      <Link
        href={step.href}
        className="flex min-h-20 items-center gap-3.5 rounded-3xl bg-card p-3.5 pr-3 transition-transform outline-none active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <step.icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-semibold">{step.title}</span>
          <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{step.text}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-foreground/60" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * "İşletmen yayında": shown right after a new business is opened (the apply wizard goes here through /isletme/sec, so the
 * new business is the active one). A short checklist of the next setup steps for its type.
 */
export default async function ApplicationDonePage({ searchParams }: Props) {
  await requireProfile(routes.business.applyDone());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const docFailed = (await searchParams).belge === "hata";
  const vertical = resolveVertical(b.vertical, b.kinds);
  const food = vertical === "yemek" || vertical === "restoran" || vertical === "kafe";

  const steps: NextStep[] = [];
  if (vertical === "otel") steps.push({ icon: BedDouble, title: "Odalarını ekle", text: "Oda tipleri, gecelik fiyatlar ve oda olanakları", href: routes.business.rooms() });
  if (food || vertical === "otel") steps.push({ icon: QrCode, title: "Menünü ekle", text: "Dijital menü ve masalar için QR menü", href: routes.business.menu() });
  if (vertical === "hizmet") steps.push({ icon: Wrench, title: "Hizmetlerini ve fiyatlarını ekle", text: "Müşteriler neye ne ödeyeceğini görsün", href: routes.business.services() });
  steps.push(
    { icon: Pencil, title: "Bilgilerini tamamla", text: "Logo, açıklama, iletişim, konum ve saatler", href: routes.business.edit() },
    { icon: ImagePlus, title: "Fotoğraf ekle", text: "Kapak fotoğrafı ve galeri", href: routes.business.photos() },
  );

  return (
    <>
      <PageHeader title="Tebrikler" backHref={routes.business.root()} hideBottomNav />
      <div className="flex flex-col gap-6 px-4 pt-6 pb-40">
        <section className="flex flex-col items-center text-center" role="status">
          <span className="flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
            <PartyPopper className="size-10" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="mt-5 text-[1.7rem] leading-tight font-extrabold text-balance">İşletmen yayında</h1>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {b.name} artık {APP_NAME}&apos;de. Birkaç adımda sayfanı güçlendir, müşteriler seni daha kolay seçsin.
          </p>
        </section>

        {docFailed ? (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-highlight-soft px-4 py-3 text-sm leading-relaxed">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-highlight-foreground dark:text-highlight" aria-hidden />
            Vergi levhan kaydedilemedi. Belgeni sonra destek ekibimize iletebilirsin.
          </p>
        ) : null}

        <section aria-labelledby="siradaki-adimlar">
          <h2 id="siradaki-adimlar" className="mb-2.5 text-lg font-semibold">
            Sıradaki adımlar
          </h2>
          <ol className="flex flex-col gap-2.5">
            <li>
              <Link
                href={routes.businesses.detail(b.slug)}
                className="flex min-h-20 items-center gap-3.5 rounded-3xl bg-card p-3.5 pr-3 transition-transform outline-none active:scale-[0.99] focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
                  <CircleCheck className="size-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug font-semibold">İşletme sayfan açıldı</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">Sayfanı müşterilerin gördüğü gibi gör</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-foreground/60" aria-hidden />
              </Link>
            </li>
            {steps.map((s) => (
              <StepRow key={s.href} step={s} />
            ))}
          </ol>
        </section>
      </div>

      <BottomDock>
        <Button asChild size="lg" className="w-full bg-foreground text-background shadow-none hover:bg-foreground/90">
          <Link href={routes.business.root()}>
            İşletme paneline git <ArrowRight />
          </Link>
        </Button>
      </BottomDock>
    </>
  );
}
