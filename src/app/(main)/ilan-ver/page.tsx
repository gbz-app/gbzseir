import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, Clock, Store, Tag, type LucideIcon } from "lucide-react";
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
      className="flex items-center gap-4 rounded-3xl bg-card p-4 ring-1 ring-foreground/[0.08] transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** E5 - İlan türü seçimi. */
export default async function PostChooserPage() {
  const { user } = await requireProfile(routes.listings.post());
  const business = await getMyBusiness(user.id);
  const approved = business?.status === "approved";

  return (
    <>
      <PageHeader title="İlan Ver" backHref={routes.listings.root()} />
      <div className="flex flex-col gap-3 px-4 pt-5 pb-8">
        <p className="text-[15px] text-muted-foreground">Ne tür bir ilan vermek istiyorsun?</p>
        <ChoiceCard href={routes.listings.postClassified()} icon={Tag} title="2. El İlan" text="Kullanmadığın eşyanı sat. Alıcılar seni doğrudan arar." />
        {approved ? (
          <ChoiceCard href={routes.listings.postJob()} icon={Briefcase} title="İş İlanı" text={`${business.name} adına personel ara.`} />
        ) : (
          <div className="flex flex-col gap-3 rounded-3xl bg-muted/60 p-4 ring-1 ring-foreground/[0.06]">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-card text-muted-foreground">
                <Briefcase className="size-7" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">İş İlanı</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                  {business?.status === "pending"
                    ? "İşletme başvurun inceleniyor. Onaylanınca iş ilanı verebilirsin."
                    : "İş ilanı vermek için onaylı işletme hesabı gerekir."}
                </span>
              </span>
            </div>
            {business?.status === "pending" ? (
              <Button asChild variant="outline">
                <Link href={routes.business.root()}>
                  <Clock /> Başvuru durumunu gör
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={business ? routes.business.root() : routes.business.intro()}>
                  <Store /> İşletme hesabına geç
                </Link>
              </Button>
            )}
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{BANNED_CATEGORIES_TEXT}</p>
      </div>
    </>
  );
}
