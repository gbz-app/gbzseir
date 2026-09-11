import type { Metadata } from "next";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { districtBySlug } from "@/config/districts";
import { formatDate, formatRelativeTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { AdminPagination, EmptyCard, FilterTabs } from "@/features/admin/components/admin-ui";
import { RequestList, type RequestRowData } from "@/features/admin/components/request-list";
import { WHEN_TYPES } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Hizmet talepleri" };

const PAGE_SIZE = 25;
const TABS = ["bekleyen", "acik", "kapali", "tumu"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { bekleyen: "Bekleyen", acik: "Açık", kapali: "Kapanan", tumu: "Tümü" };
const TAB_STATUSES: Record<Exclude<Tab, "tumu">, string[]> = {
  bekleyen: ["admin_review", "no_match"],
  acik: ["open", "filled"],
  kapali: ["closed_hired", "closed_cancelled", "expired"],
};

type Row = {
  id: string;
  public_code: string;
  status: string;
  created_at: string;
  when_type: string;
  when_date: string | null;
  accepted_count: number;
  max_providers: number;
  dispatch_note: string | null;
  is_demo: boolean;
  category_id: string;
  customer: { full_name: string | null } | null;
  district_id: string | null;
  leads: Array<{ count: number }> | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Hizmet talepleri: incele, eşleştir ve firmalara gönder (detay çekmecesi RequestList içinde). */
export default async function AdminRequestsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "bekleyen");
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  let query = supabase
    .from("service_requests")
    .select(
      "id,public_code,status,created_at,when_type,when_date,accepted_count,max_providers,dispatch_note,is_demo,category_id,customer:profiles!service_requests_customer_id_fkey(full_name),district_id,leads(count)",
      { count: "exact" },
    );
  if (tab !== "tumu") query = query.in("status", TAB_STATUSES[tab]);
  const { from, to } = pageRange(page, PAGE_SIZE);
  const [{ data, count, error }, cats, ...tabCounts] = await Promise.all([
    query.order("created_at", { ascending: tab === "bekleyen" }).range(from, to),
    supabase.from("service_categories").select("id,name,parent_id,auto_dispatch"),
    ...(["bekleyen", "acik", "kapali"] as const).map((t) => supabase.from("service_requests").select("id", { count: "exact", head: true }).in("status", TAB_STATUSES[t])),
  ]);
  const catMap = new Map((cats.data ?? []).map((c) => [c.id, c]));
  const rows: RequestRowData[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const cat = catMap.get(r.category_id);
    const parent = cat?.parent_id ? catMap.get(cat.parent_id) : null;
    return {
      id: r.id,
      code: r.public_code,
      status: r.status,
      categoryName: cat?.name ?? "Kategori",
      parentName: parent?.name ?? null,
      autoDispatch: !!cat?.auto_dispatch,
      district: districtBySlug(r.district_id)?.name ?? null,
      whenLabel: r.when_type === "tarih" && r.when_date ? formatDate(r.when_date, { month: "long" }) : (WHEN_TYPES[r.when_type] ?? r.when_type),
      createdLabel: formatRelativeTime(r.created_at),
      customerName: r.customer?.full_name ?? null,
      accepted: r.accepted_count,
      max: r.max_providers,
      leadCount: r.leads?.[0]?.count ?? 0,
      // dispatch_request writes 'area_fallback'; the text test keeps notes of older rows.
      fallback: r.dispatch_note === "area_fallback" || /tüm gebze|bölge dışı/i.test(r.dispatch_note ?? ""),
      isDemo: r.is_demo,
    };
  });
  const counts: Record<string, number> = { bekleyen: tabCounts[0].count ?? 0, acik: tabCounts[1].count ?? 0, kapali: tabCounts[2].count ?? 0 };

  return (
    <>
      <AdminPageHeader title="Hizmet talepleri" description="Talebe tıkla: cevaplar, fotoğraflar, gönderilen firmalar ve eşleşme adayları açılır; seçtiğin firmalara gönderebilirsin." />
      <FilterTabs
        ariaLabel="Talep durumu"
        items={TABS.map((t) => ({ label: TAB_LABELS[t], count: t === "tumu" ? null : counts[t], active: t === tab, href: withQuery(routes.admin.requests(), { sekme: t === "bekleyen" ? undefined : t }) }))}
      />
      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Talepler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={ClipboardList} title={tab === "bekleyen" ? "Bekleyen talep yok" : "Bu filtrede talep yok"} />
          </EmptyCard>
        ) : (
          <RequestList rows={rows} />
        )}
      </div>
      <AdminPagination path={routes.admin.requests()} query={{ sekme: tab === "bekleyen" ? undefined : tab }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
