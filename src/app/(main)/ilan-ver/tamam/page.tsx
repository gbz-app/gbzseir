import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { PushOptIn } from "@/features/profile/components/push-opt-in";

export const metadata: Metadata = { title: "İlanın Alındı", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** E8 - İlan gönderildi / yayında. */
export default async function PostDonePage({ searchParams }: Props) {
  const sp = await searchParams;
  const id = one(sp.id);
  const isJob = one(sp.tur) === "is-ilani";
  const live = one(sp.durum) === "active";
  const viewHref = id ? (isJob ? routes.listings.job(id) : routes.listings.classified(id)) : null;
  const manageHref = isJob ? routes.profile.jobs() : routes.profile.listings();

  return (
    <div className="flex min-h-[75dvh] flex-col items-center justify-center px-6 py-10 text-center">
      <div
        className={cn(
          "flex size-20 animate-pop items-center justify-center rounded-3xl",
          live ? "bg-success-soft text-success" : "bg-highlight-soft text-highlight-foreground",
        )}
      >
        {live ? <CircleCheck className="size-10" strokeWidth={1.75} aria-hidden /> : <Clock className="size-10" strokeWidth={1.75} aria-hidden />}
      </div>
      <h1 className="mt-6 text-2xl font-bold text-balance">{live ? "İlanın yayında" : "İlanın onaya gönderildi"}</h1>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-balance text-muted-foreground">
        {live
          ? isJob
            ? "İş ilanını herkes görebilir. Adaylar seni doğrudan arayacak."
            : "İlanını herkes görebilir. Alıcılar seni doğrudan arayacak."
          : "Ekibimiz ilanını kısa süre içinde inceleyecek. Onaylanınca bildirim alacaksın."}
      </p>
      {live ? null : (
        <PushOptIn
          title="Onaylanınca haber verelim"
          text="Bildirimleri açarsan ilanın onaylanır onaylanmaz telefonuna bildirim gelir."
          dismissKey="listing"
          className="mt-6 w-full max-w-sm text-left"
        />
      )}
      <div className="mt-8 flex w-full max-w-xs flex-col gap-2.5">
        {viewHref ? (
          <Button asChild size="lg">
            <Link href={viewHref}>İlanı gör</Link>
          </Button>
        ) : null}
        <Button asChild size="lg" variant="outline">
          <Link href={manageHref}>İlanlarıma git</Link>
        </Button>
        <Button asChild variant="link">
          <Link href={routes.listings.post()}>Yeni ilan ver</Link>
        </Button>
      </div>
    </div>
  );
}
