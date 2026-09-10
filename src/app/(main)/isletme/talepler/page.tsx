import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Inbox, StickyNote, Store, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuth } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { StatusBadge } from "@/features/services/components/bits";
import { ServiceIconBubble } from "@/features/services/components/service-icon";
import { SERVICE_GATE_COPY, getServiceBusiness } from "@/features/services/business";
import { leadStatusMeta, leadTab, whenLabel } from "@/features/services/labels";
import type { MyLeadRow } from "@/features/services/types";
import { neighbourhoodLabel } from "@/features/services/util";

export const metadata: Metadata = { title: "Gelen talepler", robots: { index: false } };

type Props = { searchParams: Promise<{ sekme?: string | string[] }> };
type TabKey = "yeni" | "ilgilendiklerim" | "kapanan";
type Extra = { summary: string | null; hired: boolean };

function LeadCard({ lead, extra }: { lead: MyLeadRow; extra?: Extra }) {
  const unseen = lead.status === "sent" && lead.request_status === "open";
  const meta = leadStatusMeta(lead.status, lead.request_status, extra?.hired);
  return (
    <Link
      href={routes.business.lead(lead.id)}
      className={cn(
        "block rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06] transition-[box-shadow,transform] outline-none hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]",
        unseen && "bg-brand-soft/40 ring-2 ring-primary/50",
      )}
    >
      <div className="flex items-start gap-3">
        <ServiceIconBubble name={lead.category_icon} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold">{lead.category_name}</span>
            {unseen ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Görülmedi" /> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {neighbourhoodLabel(lead.neighbourhood_name)} · {whenLabel(lead.when_type, lead.when_date)}
          </p>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} className="shrink-0" />
      </div>
      {extra?.summary ? <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed">{extra.summary}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium">
          <Users className="size-3.5" aria-hidden />
          {lead.accepted_count}/{lead.max_providers} firma ilgilendi
        </span>
        {lead.photo_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Camera className="size-3.5" aria-hidden />
            {lead.photo_count} fotoğraf
          </span>
        ) : null}
        {lead.has_note ? (
          <span className="inline-flex items-center gap-1">
            <StickyNote className="size-3.5" aria-hidden />
            Not var
          </span>
        ) : null}
        <RelativeTime date={lead.created_at} className="ml-auto" />
      </div>
    </Link>
  );
}

const EMPTY: Record<TabKey, { title: string; description: string }> = {
  yeni: { title: "Şu an yeni talep yok", description: "Bölgendeki yeni talepler burada ve bildirim olarak görünür." },
  ilgilendiklerim: { title: "Henüz bir talebe ilgilenmedin", description: "Yeni sekmesindeki talepleri inceleyip 'İlgileniyorum' diyebilirsin." },
  kapanan: { title: "Kapanan talep yok", description: "Dolan, kapanan ya da gizlediğin talepler burada durur." },
};

/** H4: incoming leads of the caller's approved service business (Yeni · İlgilendiklerim · Kapanan). */
export default async function BusinessLeadsPage({ searchParams }: Props) {
  await requireAuth(routes.business.leads());
  const gate = await getServiceBusiness();
  if (!gate.ok) {
    const copy = SERVICE_GATE_COPY[gate.reason];
    return (
      <>
        <PageHeader title="Gelen talepler" backHref={routes.business.root()} />
        <EmptyState icon={Store} title={copy.title} description={copy.description} actionLabel="İşletme paneline git" actionHref={routes.business.root()} />
      </>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("my_leads")
    .select("*")
    .eq("business_id", gate.business.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const leads = (data ?? []) as unknown as MyLeadRow[];

  const extras = new Map<string, Extra>();
  if (leads.length) {
    const { data: ex } = await supabase.rpc("my_lead_extras", { p_lead_ids: leads.map((l) => l.id) });
    for (const e of ex ?? []) extras.set(e.lead_id, { summary: e.summary, hired: e.hired });
  }

  const groups: Record<TabKey, MyLeadRow[]> = { yeni: [], ilgilendiklerim: [], kapanan: [] };
  for (const l of leads) groups[leadTab(l.status, l.request_status)].push(l);

  const requested = (await searchParams).sekme;
  const sekme = Array.isArray(requested) ? requested[0] : requested;
  const defaultTab: TabKey =
    sekme === "yeni" || sekme === "ilgilendiklerim" || sekme === "kapanan" ? sekme : groups.yeni.length || !groups.ilgilendiklerim.length ? "yeni" : "ilgilendiklerim";
  const unseenCount = groups.yeni.filter((l) => l.status === "sent").length;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "yeni", label: "Yeni" },
    { key: "ilgilendiklerim", label: "İlgilendiklerim" },
    { key: "kapanan", label: "Kapanan" },
  ];

  return (
    <>
      <PageHeader title="Gelen talepler" subtitle={gate.business.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-nav">
        <Tabs defaultValue={defaultTab} className="gap-4">
          <TabsList className="grid h-11 w-full grid-cols-3 group-data-horizontal/tabs:h-11">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1 px-1 text-[13px] font-semibold min-[400px]:text-sm">
                {t.label}
                {t.key === "yeni" && unseenCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {unseenCount}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">{groups[t.key].length}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="flex flex-col gap-3">
              {t.key === "yeni" && groups.yeni.length ? (
                <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-xs leading-relaxed">
                  Bir talebe en fazla 5 firma ilgilenebilir. &quot;İlgileniyorum&quot; dediğinde müşterinin iletişim bilgileri açılır.
                </p>
              ) : null}
              {groups[t.key].length ? (
                <ul className="flex flex-col gap-3">
                  {groups[t.key].map((l) => (
                    <li key={l.id}>
                      <LeadCard lead={l} extra={extras.get(l.id)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={Inbox} title={EMPTY[t.key].title} description={EMPTY[t.key].description} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
