import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CallButton } from "@/components/shared/call-button";
import { PriceText } from "@/components/shared/price-text";
import { RelativeTime } from "@/components/shared/relative-time";
import { VerifiedBadge } from "@/components/shared/badges";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/core/format";
import { routes } from "@/core/routes";
import { cn } from "@/lib/utils";
import { FactList, FirmLogo, PhotoGrid, RatingText, StatusBadge } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";
import { CloseRequestSheet, RemoveLeadButton, ReviewForm } from "@/features/services/components/request-actions";
import { isRequestOpen, requestStatusMeta, whenLabel } from "@/features/services/labels";
import type { CustomerRequestView } from "@/features/services/types";
import { neighbourhoodLabel, normalizeRequestCode } from "@/features/services/util";

export const metadata: Metadata = { title: "Talebim", robots: { index: false } };

type Props = { params: Promise<{ code: string }> };

function statusText(v: CustomerRequestView, hiredName: string | null): string {
  const r = v.request;
  switch (r.status) {
    case "admin_review":
      return "Talebin inceleniyor. Ekibimiz kısa süre içinde uygun firmalara iletecek; firmalar ilgilendikçe bildirim alacaksın.";
    case "open":
      if (r.accepted_count > 0) return `${r.accepted_count} firma ilgilendi. En fazla ${r.max_providers} firma ilgilenebilir; yeni firmalar ilgilendikçe bildirim alırsın.`;
      return r.sent_count > 0
        ? `Talebin ${r.sent_count} uygun firmaya iletildi. Firmalar ilgilendikçe burada göreceksin ve bildirim alacaksın.`
        : "Uygun firmalar aranıyor. Firmalar ilgilendikçe bildirim alacaksın.";
    case "filled":
      return `${r.max_providers} firma ilgilendi, talebin doldu. Bir firmayı listeden çıkarırsan yerine başka bir firma ilgilenebilir.`;
    case "no_match":
      return "Şu an bölgende uygun firma bulamadık. Ekibimiz talebini inceliyor ve uygun firmalara iletecek.";
    case "closed_hired":
      return hiredName ? `Talebini kapattın: ${hiredName} ile anlaştın.` : "Talebini kapattın.";
    case "closed_cancelled":
      return "Talebini kapattın. Yeni bir ihtiyacın olursa tekrar talep oluşturabilirsin.";
    case "expired":
      return "Talebin 14 gün içinde kapatılmadığı için süresi doldu.";
    default:
      return "";
  }
}

/** F6: the customer's request page (accepted firms, call, remove, close, review). */
export default async function RequestDetailPage({ params }: Props) {
  const { code: raw } = await params;
  const code = normalizeRequestCode(raw);
  await requireAuth(routes.services.requestDetail(code ?? raw));

  let view: CustomerRequestView | null = null;
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_request_for_customer", { p_code: code });
    if (error) throw new Error(error.message);
    view = (data as unknown as CustomerRequestView | null) ?? null;
  }

  if (!view || !code) {
    return (
      <>
        <PageHeader title="Talebim" backHref={routes.profile.requests()} />
        <EmptyState
          icon={SearchX}
          title="Talep bulunamadı"
          description="Bu talep başka bir hesaba ait olabilir ya da bağlantı hatalı."
          actionLabel="Taleplerime git"
          actionHref={routes.profile.requests()}
        />
      </>
    );
  }

  const r = view.request;
  const providers = view.providers ?? [];
  const status = requestStatusMeta(r.status, r.accepted_count);
  const open = isRequestOpen(r.status);
  const canRemove = r.status === "open" || r.status === "filled";
  const hired = providers.find((p) => p.business.id === r.hired_business_id) ?? null;
  const facts = [
    ...r.answers.filter((a) => a.display).map((a) => ({ label: a.title, value: a.display as string })),
    { label: "Konum", value: neighbourhoodLabel(r.neighbourhood?.name) },
    ...(r.address_note ? [{ label: "Adres tarifi", value: r.address_note }] : []),
    { label: "Ne zaman", value: whenLabel(r.when_type, r.when_date) },
    ...(r.note ? [{ label: "Not", value: <span className="font-medium whitespace-pre-line">{r.note}</span> }] : []),
    { label: "Telefon numaran", value: r.hide_phone ? "Gizli (firmaları sen arıyorsun)" : "İlgilenen firmalarla paylaşılıyor" },
    { label: "Oluşturma", value: formatDateTime(r.created_at, { month: "long" }) },
  ];

  return (
    <>
      <PageHeader title="Talebim" subtitle={r.category.name} backHref={routes.profile.requests()} />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-nav">
        <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <div className="flex items-start gap-3">
            <ServiceIconBubble name={r.category.icon} />
            <div className="min-w-0 flex-1">
              {r.category.parent_name ? <p className="text-xs font-medium text-muted-foreground">{r.category.parent_name}</p> : null}
              <h2 className="text-lg leading-tight font-bold">{r.category.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {neighbourhoodLabel(r.neighbourhood?.name)} · {whenLabel(r.when_type, r.when_date)} · <RelativeTime date={r.created_at} />
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <StatusBadge label={status.label} tone={status.tone} />
            <span className="text-xs text-muted-foreground">
              Kod <span className="font-mono font-semibold tracking-wider text-foreground">{r.public_code}</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{statusText(view, hired?.business.name ?? null)}</p>
          {r.status === "open" || r.status === "filled" ? (
            <div className="mt-3" aria-label={`${r.accepted_count} / ${r.max_providers} firma ilgilendi`}>
              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: r.max_providers }, (_, i) => (
                  <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < r.accepted_count ? "bg-success" : "bg-muted")} />
                ))}
              </div>
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                {r.accepted_count}/{r.max_providers} firma ilgilendi
              </p>
            </div>
          ) : null}
        </section>

        {providers.length ? (
          <section aria-labelledby="ilgilenen-firmalar">
            <h2 id="ilgilenen-firmalar" className="mb-3 text-lg font-bold">
              İlgilenen firmalar
            </h2>
            <p className="-mt-2 mb-3 text-sm text-muted-foreground">
              {r.hide_phone ? "Numaran gizli: dilediğin firmayı sen arayabilirsin." : "Firmalar seni arayabilir; sen de dilediğini arayabilirsin."}
            </p>
            <ul className="flex flex-col gap-3">
              {providers.map((p) => {
                const b = p.business;
                const isHired = r.hired_business_id === b.id;
                return (
                  <li key={p.lead_id} className={cn("rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]", isHired && "ring-2 ring-success/60")}>
                    <div className="flex items-start gap-3">
                      <FirmLogo name={b.name} logoUrl={b.logo_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold">{b.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {b.verification_level >= 1 ? <VerifiedBadge className="h-5 px-2" /> : null}
                          <RatingText avg={b.rating_avg} count={b.rating_count} />
                        </div>
                        {b.category_label ? <p className="mt-1 truncate text-xs text-muted-foreground">{b.category_label}</p> : null}
                      </div>
                      {isHired ? (
                        <Badge variant="success" className="h-6 px-2.5">
                          Anlaştın
                        </Badge>
                      ) : null}
                    </div>
                    {p.offer_price_try !== null && p.offer_price_try !== undefined ? (
                      <p className="mt-3 text-sm">
                        <span className="text-muted-foreground">Tahmini: </span>
                        <PriceText amount={p.offer_price_try} className="text-base" />
                      </p>
                    ) : null}
                    {p.offer_note ? <p className="mt-2 rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line">{p.offer_note}</p> : null}
                    {p.accepted_at ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <RelativeTime date={p.accepted_at} /> ilgilendi
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {b.phone ? <CallButton phone={b.phone} subjectType="lead" subjectId={p.lead_id} label="Ara" fullWidth /> : null}
                      <Button asChild variant="outline" className={b.phone ? "" : "col-span-2"}>
                        <Link href={routes.businesses.detail(b.slug)}>Profili gör</Link>
                      </Button>
                    </div>
                    {canRemove ? <RemoveLeadButton leadId={p.lead_id} firmName={b.name} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {r.status === "closed_hired" && hired ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="degerlendirme">
            <h2 id="degerlendirme" className="mb-3 text-lg font-bold">
              {view.review ? "Değerlendirmen" : `${hired.business.name} ile nasıldı?`}
            </h2>
            <ReviewForm
              code={r.public_code}
              businessId={hired.business.id}
              businessName={hired.business.name}
              existing={view.review ? { rating: view.review.rating, comment: view.review.comment, reply: view.review.reply } : null}
            />
          </section>
        ) : null}

        <Accordion type="single" collapsible className="rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <AccordionItem value="cevaplar">
            <AccordionTrigger className="min-h-14 items-center py-3 text-[15px] font-bold hover:no-underline">Cevapların</AccordionTrigger>
            <AccordionContent className="pb-4">
              <FactList items={facts} />
              {r.photos.length ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Fotoğraflar</p>
                  <PhotoGrid photos={r.photos} />
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {open ? (
          <CloseRequestSheet code={r.public_code} providers={providers.map((p) => ({ businessId: p.business.id, name: p.business.name }))} />
        ) : (
          <Button asChild variant="outline" size="lg">
            <Link href={routes.services.root()}>Yeni talep oluştur</Link>
          </Button>
        )}
      </div>
    </>
  );
}
