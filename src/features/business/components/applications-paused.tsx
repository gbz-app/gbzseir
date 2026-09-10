import Link from "next/link";
import { Phone, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { APP_NAME, SUPPORT } from "@/config/site";
import { telHref } from "@/core/phone";
import { routes } from "@/core/routes";

/** Shown instead of the application wizard while FEATURES.businessApplications is off. */
export function ApplicationsPaused() {
  return (
    <>
      <PageHeader title="İşletme başvurusu" backHref={routes.profile.root()} />
      <div className="flex flex-col items-center px-6 pt-10 pb-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-primary">
          <Store className="size-8" strokeWidth={1.75} aria-hidden />
        </span>
        <h2 className="mt-5 text-xl font-semibold">Başvurular yakında açılacak</h2>
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          {APP_NAME} şu an deneme aşamasında. Yeni işletme başvurularını kısa süre sonra açacağız. İşletmeni listelemek ya da reklam vermek için bize
          ulaşabilirsin.
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <Button asChild size="lg">
            <a href={telHref(SUPPORT.phone)}>
              <Phone /> {SUPPORT.phoneDisplay}
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={routes.home()}>Ana sayfaya dön</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
