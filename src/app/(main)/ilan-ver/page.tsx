import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, Pencil, Store, Tag, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { BANNED_CATEGORIES_TEXT } from "@/features/listings/constants";
import { getMyBusiness } from "@/features/listings/server/queries";

export const metadata: Metadata = { title: "İlan Ver", robots: { index: false } };

function ChoiceCard({ href, icon: Icon, title, text }: { href: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-3xl bg-card p-4 transition-colors outline-none hover:bg-card/80 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * E5 - İlan türü seçimi. Every signed-in user can post a 2. el listing; job ads are only for approved business
 * owners. Users without a business never see the job option; owners of a business that is not approved see why.
 */
export default async function PostChooserPage() {
  const { user } = await requireProfile(routes.listings.post());
  const business = await getMyBusiness(user.id);
  const approved = business?.status === "approved";
  const unfinished = business?.status === "pending" || business?.status === "rejected";

  return (
    <>
      <PageHeader title="İlan Ver" backHref={routes.listings.classifieds()} />
      <div className="flex flex-col gap-3 px-4 pt-5 pb-8">
        <p className="text-[15px] text-muted-foreground">{business ? "Ne tür bir ilan vermek istiyorsun?" : "Kullanmadığın eşyanı birkaç adımda ilana koy."}</p>
        <ChoiceCard href={routes.listings.postClassified()} icon={Tag} title="İkinci El İlan" text="Kullanmadığın eşyanı sat. Alıcılar seni doğrudan arar." />
        {business && approved ? (
          <ChoiceCard href={routes.listings.postJob()} icon={Briefcase} title="İş İlanı" text={`${business.name} adına personel ara.`} />
        ) : business ? (
          <div className="flex flex-col gap-3 rounded-3xl bg-card/60 p-4">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-card text-muted-foreground">
                <Briefcase className="size-7" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">İş İlanı</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                  {unfinished
                    ? "İşletmen henüz yayında değil. Bilgilerini tamamla, hemen yayına girsin; sonra iş ilanı verebilirsin."
                    : business.status === "suspended"
                      ? "İşletme hesabın askıya alındığı için şu an iş ilanı veremezsin."
                      : "İşletmen onaylandığında iş ilanı verebilirsin."}
                </span>
              </span>
            </div>
            {unfinished ? (
              <Button asChild variant="secondary" className="bg-card">
                <Link href={routes.business.applyEdit(business.id)}>
                  <Pencil /> Bilgileri tamamla
                </Link>
              </Button>
            ) : (
              <Button asChild variant="secondary" className="bg-card">
                <Link href={routes.business.root()}>
                  <Store /> İşletme paneline git
                </Link>
              </Button>
            )}
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{BANNED_CATEGORIES_TEXT}</p>
      </div>
    </>
  );
}
