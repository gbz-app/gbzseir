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
import { formatRelativeTime } from "@/core/format";
import { routes } from "@/core/routes";
import { eventCategoryInfo } from "@/features/business/lib/verticals";
import { DEFAULT_VOCABULARIES, loadVocabularies } from "@/features/business/lib/vocabularies";
import { EventsManager } from "@/features/events/components/events-manager";
import { eventPriceLabel, eventWhenShort } from "@/features/events/format";
import { OWNER_EVENT_COLUMNS, toOwnerEvent } from "@/features/events/owner-queries";
import { AdminCard, AdminPagination, AdminThumb, EmptyCard, FilterTabs, StatusBadge } from "@/features/admin/components/admin-ui";
import { EventModeration } from "@/features/admin/components/event-moderation";
import type { LabelMap } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Etkinlikler" };

const PAGE_SIZE = 20;
const TABS = ["yaklasan", "gecmis", "taslak", "iptal", "tumu"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { yaklasan: "Yaklaşan", gecmis: "Geçmiş", taslak: "Taslak", iptal: "İptal", tumu: "Tümü" };
const EVENT_STATUS: LabelMap = {
  published: { label: "Yayında", tone: "success" },
  draft: { label: "Taslak", tone: "secondary" },
  cancelled: { label: "İptal", tone: "destructive" },
};

type Row = {
  id: string;
  slug: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  is_free: boolean;
  price_try: number | null;
  cover_url: string | null;
  venue_name: string | null;
  is_demo: boolean;
  created_at: string;
  businesses: { name: string; slug: string } | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Etkinlik moderasyonu (tüm işletmeler) + şehir etkinliği ekleme (işletmesiz). */
export default async function AdminEventsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "yaklasan");
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase
    .from("events")
    .select("id,slug,title,category,starts_at,ends_at,status,is_free,price_try,cover_url,venue_name,is_demo,created_at,businesses(name,slug)", { count: "exact" });
  if (tab === "yaklasan") query = query.eq("status", "published").or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at");
  else if (tab === "gecmis") query = query.lt("starts_at", now).or(`ends_at.lt.${now},ends_at.is.null`).order("starts_at", { ascending: false });
  else if (tab === "taslak") query = query.eq("status", "draft").order("created_at", { ascending: false });
  else if (tab === "iptal") query = query.eq("status", "cancelled").order("starts_at", { ascending: false });
  else query = query.order("starts_at", { ascending: false });
  const { from, to } = pageRange(page, PAGE_SIZE);

  const [{ data, count, error }, city, vocab] = await Promise.all([
    query.range(from, to),
    supabase.from("events").select(OWNER_EVENT_COLUMNS).is("business_id", null).order("starts_at", { ascending: false }).limit(100),
    // Fresh read (the admin site's own cache is not expired by revalidatePublic).
    loadVocabularies(supabase).catch(() => DEFAULT_VOCABULARIES),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const cityEvents = ((city.data ?? []) as unknown as Parameters<typeof toOwnerEvent>[0][]).map(toOwnerEvent);

  return (
    <>
      <AdminPageHeader title="Etkinlikler" description="İşletmelerin eklediği etkinlikleri denetle; belediye ve şehir etkinliklerini buradan ekle." />

      <div className="grid gap-4">
        <AdminCard title="Şehir etkinlikleri" description="Bir işletmeye bağlı olmayan etkinlikler (konser, festival, koşu...).">
          <EventsManager
            business={{ id: null, name: CITY.name, address: null, phone: null, lat: CITY.center.lat, lng: CITY.center.lng, neighbourhoodId: null }}
            initial={cityEvents}
            categories={vocab.eventCategories}
          />
        </AdminCard>

        <FilterTabs ariaLabel="Etkinlik filtresi" items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: `${routes.admin.events()}${t === "yaklasan" ? "" : `?sekme=${t}`}` }))} />

        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Etkinlikler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={CalendarDays} title="Bu filtrede etkinlik yok" />
          </EmptyCard>
        ) : (
          rows.map((e) => {
            const cat = eventCategoryInfo(e.category, vocab.eventCategories);
            return (
              <AdminCard key={e.id} as="article">
                <div className="flex items-start gap-3">
                  <AdminThumb src={e.cover_url} size={72} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={EVENT_STATUS} value={e.status} />
                      <Badge variant="secondary">{cat.label}</Badge>
                      {e.is_demo ? <DemoBadge /> : null}
                    </div>
                    <h2 className="mt-1.5 font-bold break-words">{e.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {eventWhenShort(e.starts_at, e.ends_at)} · {eventPriceLabel(e)} · {e.venue_name ?? "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.businesses ? (
                        <>
                          Düzenleyen:{" "}
                          <a className="text-primary hover:underline" href={publicUrl(routes.businesses.detail(e.businesses.slug))} target="_blank" rel="noopener noreferrer">
                            {e.businesses.name}
                          </a>
                        </>
                      ) : (
                        "Şehir etkinliği"
                      )}{" "}
                      · eklendi {formatRelativeTime(e.created_at)}
                    </p>
                  </div>
                </div>
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
        <AdminPagination path={routes.admin.events()} query={{ sekme: tab === "yaklasan" ? undefined : tab }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </div>
    </>
  );
}
