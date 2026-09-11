import type { Metadata } from "next";
import { CheckCircle2, CircleSlash, Lock, PartyPopper, SearchX, Store, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CallButton } from "@/components/shared/call-button";
import { PriceText } from "@/components/shared/price-text";
import { RelativeTime } from "@/components/shared/relative-time";
import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatPhoneTR } from "@/core/format";
import { routes } from "@/core/routes";
import { FactList, PhotoGrid } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";
import { LeadActions, LeadTip } from "@/features/services/components/lead-actions";
import { SERVICE_GATE_COPY, getServiceBusiness } from "@/features/services/business";
import { whenLabel } from "@/features/services/labels";
import type { LeadDetailView } from "@/features/services/types";
import { UUID_RE, neighbourhoodLabel } from "@/features/services/util";

export const metadata: Metadata = { title: "Talep detayı", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

/** Request photos are private: /api/talep-foto checks access and redirects to a short-lived signed URL. */
const requestPhotoSrc = (requestId: string, index: number) => `/api/talep-foto?r=${requestId}&i=${index}`;

type Banner = { icon: LucideIcon; tone: "success" | "muted" | "warning"; title: string; text: string };

function bannerFor(v: LeadDetailView, hired: boolean): Banner | null {
  const { lead, request: r } = v;
  const closed = r.status === "closed_hired" || r.status === "closed_cancelled" || r.status === "expired";
  if (hired) return { icon: PartyPopper, tone: "success", title: "Müşteri seninle çalışmaya karar verdi", text: "Talep kapandı ve iş sana verildi. Başarılar!" };
  if (lead.status === "accepted") {
    if (closed)
      return {
        icon: CircleSlash,
        tone: "muted",
        title: "Talep kapandı",
        text: r.status === "closed_hired" ? "Müşteri başka bir firmayla anlaştı." : "Müşteri talebini kapattı ya da talebin süresi doldu.",
      };
    return { icon: CheckCircle2, tone: "success", title: "İlgilendiğini müşteriye bildirdin", text: "Müşteri bir bildirim aldı. Aşağıdan iletişim bilgilerini görebilirsin." };
  }
  if (lead.status === "declined") return { icon: CircleSlash, tone: "muted", title: "Bu talebi gizledin", text: "Gizlediğin talepler Kapanan sekmesinde durur." };
  if (lead.status === "removed_by_customer")
    return { icon: CircleSlash, tone: "muted", title: "Müşteri başka firmalarla devam ediyor", text: "Bu talepte artık listede değilsin." };
  if (closed) return { icon: CircleSlash, tone: "muted", title: "Bu talep kapandı", text: "Müşteri talebini kapattı ya da talebin süresi doldu." };
  if (lead.status === "closed_full" || r.status === "filled")
    return { icon: Users, tone: "warning", title: "Bu talep doldu", text: `En fazla ${r.max_providers} firma ilgilenebiliyordu; bu talep için yer kalmadı.` };
  if (!v.can_accept) return { icon: CircleSlash, tone: "muted", title: "Bu talep şu an açık değil", text: "Talep inceleniyor ya da kapanmış olabilir." };
  return null;
}

const BANNER_TONE = {
  success: "bg-success-soft text-success",
  muted: "bg-muted text-muted-foreground",
  warning: "bg-highlight-soft text-highlight-foreground",
} as const;

/** H5: lead detail for the business (answers, photos, neighbourhood; contact only after "İlgileniyorum"). */
export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  await requireAuth(routes.business.lead(id));
  const gate = await getServiceBusiness();
  if (!gate.ok) {
    const copy = SERVICE_GATE_COPY[gate.reason];
    return (
      <>
        <PageHeader title="Talep detayı" backHref={routes.business.root()} />
        <EmptyState icon={Store} title={copy.title} description={copy.description} actionLabel="İşletme paneline git" actionHref={routes.business.root()} />
      </>
    );
  }

  const supabase = await createClient();
  let view: LeadDetailView | null = null;
  let hired = false;
  if (UUID_RE.test(id)) {
    const { data, error } = await supabase.rpc("get_lead_detail", { p_lead_id: id });
    if (error) throw new Error(error.message);
    view = (data as unknown as LeadDetailView | null) ?? null;
    if (view) {
      const { data: ex } = await supabase.rpc("my_lead_extras", { p_lead_ids: [id] });
      hired = !!ex?.[0]?.hired;
    }
  }

  if (!view) {
    return (
      <>
        <PageHeader title="Talep detayı" backHref={routes.business.leads()} />
        <EmptyState
          icon={SearchX}
          title="Talep bulunamadı"
          description="Bu talep işletmene ait değil ya da kaldırılmış."
          actionLabel="Gelen taleplere dön"
          actionHref={routes.business.leads()}
        />
      </>
    );
  }

  const { lead, request: r, customer } = view;
  const accepted = lead.status === "accepted";
  const banner = bannerFor(view, hired);
  const answers = r.answers.filter((a) => a.display).map((a) => ({ label: a.title, value: a.display as string }));

  return (
    <>
      <PageHeader title="Talep detayı" subtitle={r.category.name} backHref={routes.business.leads()} hideBottomNav={view.can_accept} />
      <div className={cn("flex flex-col gap-4 px-4 pt-4", view.can_accept ? "pb-4" : "pb-nav")}>
        {view.can_accept ? <LeadTip /> : null}

        {banner ? (
          <div className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5", BANNER_TONE[banner.tone])}>
            <banner.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-bold">{banner.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed opacity-90">{banner.text}</p>
            </div>
          </div>
        ) : null}

        {accepted ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="musteri">
            <p id="musteri" className="text-xs font-medium text-muted-foreground">
              Müşteri
            </p>
            <p className="text-lg font-bold">{customer.display_name || "Müşteri"}</p>
            {customer.phone ? (
              <>
                <p className="text-[15px] font-semibold tabular-nums">{formatPhoneTR(customer.phone)}</p>
                <CallButton phone={customer.phone} subjectType="lead" subjectId={lead.id} label="Müşteriyi ara" fullWidth size="lg" className="mt-3" />
              </>
            ) : customer.hide_phone ? (
              <p className="mt-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm font-semibold">Müşteri sizi arayacak.</p>
            ) : null}
            {r.address_note || lead.offer_price_try !== null || lead.offer_note ? (
              <FactList
                className="mt-4 border-t pt-3"
                items={[
                  ...(r.address_note ? [{ label: "Adres tarifi", value: r.address_note }] : []),
                  ...(lead.offer_price_try !== null ? [{ label: "Tahmini fiyatın", value: <PriceText amount={lead.offer_price_try} /> }] : []),
                  ...(lead.offer_note ? [{ label: "Notun", value: <span className="font-medium whitespace-pre-line">{lead.offer_note}</span> }] : []),
                ]}
              />
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <div className="flex items-start gap-3">
            <ServiceIconBubble name={r.category.icon} />
            <div className="min-w-0 flex-1">
              {r.category.parent_name ? <p className="text-xs font-medium text-muted-foreground">{r.category.parent_name}</p> : null}
              <h2 className="text-lg leading-tight font-bold">{r.category.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <RelativeTime date={r.created_at} /> · Müşteri: {customer.display_name || "Gizli"}
              </p>
            </div>
          </div>
          <FactList
            className="mt-4 border-t pt-3"
            items={[
              { label: "Mahalle", value: neighbourhoodLabel(r.neighbourhood?.name) },
              { label: "Ne zaman", value: whenLabel(r.when_type, r.when_date) },
            ]}
          />
          <div className="mt-3 border-t pt-3" aria-label={`${r.accepted_count} / ${r.max_providers} firma ilgilendi`}>
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: r.max_providers }, (_, i) => (
                <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < r.accepted_count ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
              {r.accepted_count}/{r.max_providers} firma ilgilendi
            </p>
          </div>
        </section>

        {answers.length ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="cevaplar">
            <h3 id="cevaplar" className="mb-3 font-bold">
              Müşterinin cevapları
            </h3>
            <FactList items={answers} />
          </section>
        ) : null}

        {r.note ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="not">
            <h3 id="not" className="mb-2 font-bold">
              Müşterinin notu
            </h3>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{r.note}</p>
          </section>
        ) : null}

        {r.photos.length ? (
          <section className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-labelledby="fotograflar">
            <h3 id="fotograflar" className="mb-3 font-bold">
              Fotoğraflar
            </h3>
            <PhotoGrid photos={r.photos.map((_, i) => requestPhotoSrc(r.id, i))} />
          </section>
        ) : null}

        {!accepted ? (
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
            Müşterinin adı, telefonu ve adres tarifi &quot;İlgileniyorum&quot; dediğinde açılır.
          </p>
        ) : null}

        {view.can_accept ? <LeadActions leadId={lead.id} acceptedCount={r.accepted_count} maxProviders={r.max_providers} /> : null}
      </div>
    </>
  );
}
