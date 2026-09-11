import type { Metadata } from "next";
import { CalendarDays, ExternalLink, TriangleAlert } from "lucide-react";
import { publicUrl } from "@/config/app-mode";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { CITY } from "@/config/site";
import { formatPhoneTR, formatRelativeTime, truncate } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { eventCategoryInfo } from "@/features/business/lib/verticals";
import { DEFAULT_VOCABULARIES, loadVocabularies } from "@/features/business/lib/vocabularies";
import { EventsManager } from "@/features/events/components/events-manager";
import { eventPriceLabel, eventWhenShort } from "@/features/events/format";
import { OWNER_EVENT_COLUMNS, toOwnerEvent } from "@/features/events/owner-queries";
import { AdminCard, AdminPagination, AdminThumb, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { EventModeration } from "@/features/admin/components/event-moderation";
import { EVENT_STATUS } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Etkinlikler" };

const PAGE_SIZE = 20;
const TABS = ["onay", "yaklasan", "gecmis", "reddedilen", "taslak", "iptal", "tumu"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  onay: "Onay bekleyen",
  yaklasan: "Yaklaşan",
  gecmis: "Geçmiş",
  reddedilen: "Reddedilen",
  taslak: "Taslak",
  iptal: "İptal",
  tumu: "Tümü",
};

const ROW_COLUMNS =
  "id,slug,title,description,category,starts_at,ends_at,status,is_free,price_try,cover_url,venue_name,address,is_demo,created_at,admin_hidden,rejection_reason,organizer_name,has_contact_phone,business_id,businesses(name,slug),creator:profiles!events_created_by_fkey(full_name)";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  is_free: boolean;
  price_try: number | null;
  cover_url: string | null;
  venue_name: string | null;
  address: string | null;
  is_demo: boolean;
  created_at: string;
  admin_hidden: boolean;
  rejection_reason: string | null;
  organizer_name: string | null;
  has_contact_phone: boolean | null;
  business_id: string | null;
  businesses: { name: string; slug: string } | null;
  creator: { full_name: string | null } | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Etkinlik moderasyonu: kullanıcı etkinlikleri onay kuyruğu, tüm etkinlikler, şehir etkinliği ekleme (işletmesiz). */
export default async function AdminEventsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const { count: pendingCount } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "pending_review");
  const pending = pendingCount ?? 0;
  const defaultTab: Tab = pending > 0 ? "onay" : "yaklasan";
  const tab = oneOf<Tab>(sp.sekme, TABS, defaultTab);
  const page = pageParam(sp.sayfa);
  const now = new Date().toISOString();

  let query = supabase.from("events").select(ROW_COLUMNS, { count: "exact" });
  if (tab === "onay") query = query.eq("status", "pending_review").order("created_at");
  else if (tab === "yaklasan") query = query.eq("status", "published").or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at");
  else if (tab === "gecmis") query = query.lt("starts_at", now).or(`ends_at.lt.${now},ends_at.is.null`).order("starts_at", { ascending: false });
  else if (tab === "reddedilen") query = query.eq("status", "rejected").order("reviewed_at", { ascending: false, nullsFirst: false });
  else if (tab === "taslak") query = query.eq("status", "draft").order("created_at", { ascending: false });
  else if (tab === "iptal") query = query.eq("status", "cancelled").order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });
  const { from, to } = pageRange(page, PAGE_SIZE);

  const [{ data, count, error }, city, vocab] = await Promise.all([
    query.range(from, to),
    supabase.from("events").select(OWNER_EVENT_COLUMNS).is("business_id", null).is("organizer_name", null).order("starts_at", { ascending: false }).limit(100),
    // Fresh read (the admin site's own cache is not expired by revalidatePublic).
    loadVocabularies(supabase).catch(() => DEFAULT_VOCABULARIES),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const cityEvents = ((city.data ?? []) as unknown as Parameters<typeof toOwnerEvent>[0][]).map(toOwnerEvent);

  // Contact phones of user events (not readable through the API; admin-only RPC).
  const withPhone = rows.filter((r) => r.has_contact_phone).map((r) => r.id);
  const { data: contacts } = withPhone.length ? await supabase.rpc("admin_event_contacts", { p_ids: withPhone }) : { data: null };
  const phoneOf = new Map((contacts ?? []).map((c) => [c.event_id, c.contact_phone]));
  const tabHref = (t: Tab) => withQuery(routes.admin.events(), { sekme: t === defaultTab ? undefined : t });

  return (
    <>
      <AdminPageHeader title="Etkinlikler" description="Kullanıcı etkinliklerini onayla, tüm etkinlikleri denetle; belediye ve şehir etkinliklerini buradan ekle." />

      <div className="grid gap-4">
        <FilterTabs
          ariaLabel="Etkinlik filtresi"
          items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: tabHref(t), count: t === "onay" ? pending : undefined }))}
        />

        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Etkinlikler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={CalendarDays} title={tab === "onay" ? "Onay bekleyen etkinlik yok" : "Bu filtrede etkinlik yok"} />
          </EmptyCard>
        ) : (
          rows.map((e) => {
            const cat = eventCategoryInfo(e.category, vocab.eventCategories);
            const contact = phoneOf.get(e.id);
            return (
              <AdminCard key={e.id} as="article">
                <div className="flex items-start gap-3">
                  <AdminThumb src={e.cover_url} size={tab === "onay" ? 96 : 72} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={EVENT_STATUS} value={e.status} />
                      <Badge variant="secondary">{cat.label}</Badge>
                      {e.admin_hidden ? <Badge variant="destructive">Yönetici kaldırdı</Badge> : null}
                      {e.is_demo ? <DemoBadge /> : null}
                    </div>
                    <h2 className="mt-1.5 font-bold break-words">{e.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {eventWhenShort(e.starts_at, e.ends_at)} · {eventPriceLabel(e)} · {e.venue_name ?? "-"}
                    </p>
                    {e.address ? <p className="text-sm text-muted-foreground">{e.address}</p> : null}
                    <p className="text-xs text-muted-foreground">
                      {e.businesses ? (
                        <>
                          Düzenleyen:{" "}
                          <a className="text-primary hover:underline" href={publicUrl(routes.businesses.detail(e.businesses.slug))} target="_blank" rel="noopener noreferrer">
                            {e.businesses.name}
                          </a>
                        </>
                      ) : e.organizer_name ? (
                        `Düzenleyen: ${e.creator?.full_name ?? e.organizer_name} (kullanıcı)`
                      ) : (
                        "Şehir etkinliği"
                      )}{" "}
                      · eklendi {formatRelativeTime(e.created_at)}
                    </p>
                    {contact ? <p className="text-xs text-muted-foreground">İletişim: {formatPhoneTR(contact)}</p> : null}
                  </div>
                </div>
                {e.description && (tab === "onay" || e.status === "pending_review") ? (
                  <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm leading-relaxed break-words whitespace-pre-line">{truncate(e.description, 600)}</p>
                ) : null}
                {e.rejection_reason ? (
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Gerekçe:</span> {e.rejection_reason}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <EventModeration id={e.id} title={e.title} status={e.status} />
                  {e.status === "published" ? (
                    <a
                      href={publicUrl(routes.events.detail(e.slug))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      Sayfayı aç <ExternalLink className="size-4" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </AdminCard>
            );
          })
        )}
        <AdminPagination path={routes.admin.events()} query={{ sekme: tab === defaultTab ? undefined : tab }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />

        <AdminCard title="Şehir etkinlikleri" description="Bir işletmeye bağlı olmayan, yönetimin eklediği etkinlikler (konser, festival, koşu...). Hemen yayına girer.">
          <EventsManager
            business={{ id: null, name: CITY.name, address: null, phone: null, lat: CITY.center.lat, lng: CITY.center.lng, neighbourhoodId: null }}
            initial={cityEvents}
            categories={vocab.eventCategories}
          />
        </AdminCard>
      </div>
    </>
  );
}
