import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, TriangleAlert, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatPhoneTR, formatRelativeTime, initials } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { AdminPagination, EmptyCard, FilterTabs, SearchBox, StatusBadge } from "@/features/admin/components/admin-ui";
import { PROFILE_STATUS } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange, searchTerm } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Kullanıcılar" };

const PAGE_SIZE = 25;
const FILTERS = ["tumu", "isletme", "kisitli", "yonetici", "demo"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = { tumu: "Tümü", isletme: "İşletme sahipleri", kisitli: "Kısıtlı / engelli", yonetici: "Yöneticiler", demo: "Örnek hesaplar" };

type Row = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  trusted_publisher: boolean;
  is_demo: boolean;
  created_at: string;
  neighbourhoods: { name: string } | null;
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Kullanıcı arama ve listesi: durum, işletme, son görülme. */
export default async function AdminUsersPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = oneOf<Filter>(sp.filtre, FILTERS, "tumu");
  const q = searchTerm(sp.q);
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  const { data: owners } = await supabase.from("businesses").select("owner_id,name,slug,status");
  const ownerMap = new Map((owners ?? []).map((b) => [b.owner_id, b]));

  let query = supabase
    .from("profiles")
    .select("id,full_name,phone,avatar_url,role,status,trusted_publisher,is_demo,created_at,neighbourhoods!profiles_neighbourhood_id_fkey(name)", { count: "exact" });
  if (filter === "isletme") query = query.in("id", [...ownerMap.keys()].length ? [...ownerMap.keys()] : ["00000000-0000-0000-0000-000000000000"]);
  if (filter === "kisitli") query = query.neq("status", "active");
  if (filter === "yonetici") query = query.eq("role", "admin");
  if (filter === "demo") query = query.eq("is_demo", true);
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = digits.length >= 3 ? query.ilike("phone", `%${digits.replace(/^0/, "")}%`) : query.ilike("full_name", `%${q}%`);
  }
  const { from, to } = pageRange(page, PAGE_SIZE);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  const rows = (data ?? []) as unknown as Row[];

  const ids = rows.map((r) => r.id);
  const lastSeen = new Map<string, string>();
  if (ids.length) {
    const { data: seen } = await supabase.from("analytics_sessions").select("user_id,last_seen_at").in("user_id", ids).order("last_seen_at", { ascending: false }).limit(1000);
    for (const s of seen ?? []) if (s.user_id && !lastSeen.has(s.user_id)) lastSeen.set(s.user_id, s.last_seen_at);
  }
  const baseQuery = { filtre: filter === "tumu" ? undefined : filter, q };

  return (
    <>
      <AdminPageHeader title="Kullanıcılar" description="Ada ya da telefona göre ara. Ayrıntıda hesap hareketleri, gezdiği sayfalar ve oturumlar görünür." />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Kullanıcı filtresi"
          items={FILTERS.map((f) => ({ label: FILTER_LABELS[f], active: f === filter, href: withQuery(routes.admin.users(), { ...baseQuery, filtre: f === "tumu" ? undefined : f, sayfa: undefined }) }))}
        />
        <SearchBox action={routes.admin.users()} defaultValue={q} placeholder="Ad ya da telefon (5xx...)" label="Kullanıcı ara" hidden={{ filtre: baseQuery.filtre }} />
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Kullanıcılar yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={Users} title="Kullanıcı bulunamadı" description={q ? "Aramayı değiştirip tekrar dene." : undefined} />
          </EmptyCard>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            {rows.map((u) => {
              const biz = ownerMap.get(u.id);
              const seen = lastSeen.get(u.id);
              return (
                <li key={u.id}>
                  <Link href={routes.admin.user(u.id)} className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted">
                    <Avatar className="size-11">
                      {u.avatar_url ? <AvatarImage src={u.avatar_url} alt="" /> : null}
                      <AvatarFallback className="bg-brand-soft text-sm font-semibold text-primary">{initials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold">{u.full_name || "İsimsiz"}</span>
                        {u.status !== "active" ? <StatusBadge map={PROFILE_STATUS} value={u.status} /> : null}
                        {u.role === "admin" ? <Badge variant="info">Yönetici</Badge> : null}
                        {biz ? <Badge variant="secondary">{biz.name}</Badge> : null}
                        {u.trusted_publisher ? <Badge variant="success">Güvenilir</Badge> : null}
                        {u.is_demo ? <DemoBadge /> : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {formatPhoneTR(u.phone) || "Telefon yok"}
                        {u.neighbourhoods?.name ? ` · ${u.neighbourhoods.name}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Katıldı {formatRelativeTime(u.created_at)}
                        {seen ? ` · Son görülme ${formatRelativeTime(seen)}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AdminPagination path={routes.admin.users()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
