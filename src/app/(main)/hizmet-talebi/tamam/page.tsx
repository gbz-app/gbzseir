import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Hourglass, SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/core/routes";
import { PushOptInCard } from "@/features/services/components/push-opt-in-card";
import type { CustomerRequestView } from "@/features/services/types";
import { normalizeRequestCode } from "@/features/services/util";

export const metadata: Metadata = { title: "Talebin alındı", robots: { index: false } };

type Props = { searchParams: Promise<{ kod?: string | string[] }> };

/** F5: confirmation after submit (+ soft push opt-in). */
export default async function RequestDonePage({ searchParams }: Props) {
  const code = normalizeRequestCode((await searchParams).kod);
  await requireAuth(routes.services.requestDone(code ?? undefined));

  let view: CustomerRequestView | null = null;
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_request_for_customer", { p_code: code });
    view = (data as unknown as CustomerRequestView | null) ?? null;
  }

  if (!view) {
    return (
      <>
        <PageHeader title="Talep" backHref={routes.profile.requests()} />
        <EmptyState
          icon={SearchX}
          title="Talep bulunamadı"
          description="Bu bağlantı geçersiz ya da talep başka bir hesaba ait."
          actionLabel="Taleplerime git"
          actionHref={routes.profile.requests()}
        />
      </>
    );
  }

  const r = view.request;
  const reviewing = r.status === "admin_review" || r.status === "no_match";
  const headline = r.status === "open" || r.status === "filled" ? "Talebin uygun firmalara iletildi" : "Talebin alındı";
  const body =
    r.status === "admin_review"
      ? "Talebin inceleniyor, kısa süre içinde uygun firmalara iletilecek. Firmalar ilgilendikçe bildirim alacaksın."
      : r.status === "no_match"
        ? "Şu an bölgende uygun firma bulamadık. Ekibimiz talebini inceleyip uygun firmalara iletecek."
        : "Firmalar ilgilendikçe bildirim alacaksın. İlgilenen firmaları talep sayfanda görüp arayabilirsin.";

  return (
    <>
      <PageHeader title="Talebin alındı" hideBack />
      <div className="flex flex-col gap-6 px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <section className="flex flex-col items-center text-center">
          <span
            className={
              reviewing
                ? "flex size-20 animate-pop items-center justify-center rounded-full bg-highlight-soft text-highlight-foreground"
                : "flex size-20 animate-pop items-center justify-center rounded-full bg-success-soft text-success"
            }
          >
            {reviewing ? <Hourglass className="size-10" aria-hidden /> : <CheckCircle2 className="size-11" aria-hidden />}
          </span>
          <h2 className="mt-5 text-2xl leading-tight font-extrabold text-balance">{headline}</h2>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-balance text-muted-foreground">{body}</p>
          <p className="mt-4 rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold">
            {r.category.name} · Talep kodu <span className="font-mono tracking-wider">{r.public_code}</span>
          </p>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <h3 className="font-bold">Sırada ne var?</h3>
          <ol className="mt-3 flex flex-col gap-3 text-sm leading-relaxed">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-primary">1</span>
              <span>Uygun firmalar talebini inceler.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-primary">2</span>
              <span>İlgilenen firmalar (en fazla {r.max_providers}) talep sayfanda fiyat tahminleriyle görünür.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-primary">3</span>
              <span>
                {r.hide_phone
                  ? "Numaran gizli: profillere bakıp dilediğin firmayı sen ararsın."
                  : "Firmalar seni arayabilir; sen de profillere bakıp dilediğini arayabilirsin."}
              </span>
            </li>
          </ol>
        </section>

        <PushOptInCard />

        <div className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={routes.services.requestDetail(r.public_code)}>Talebime git</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href={routes.home()}>Ana sayfaya dön</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
