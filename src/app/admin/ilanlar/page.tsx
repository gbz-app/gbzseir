import type { Metadata } from "next";
import { CheckCircle2, Store, TriangleAlert, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { formatDateTime, formatPhoneTR, formatPrice, formatPriceRange, formatRelativeTime } from "@/core/format";
import {
  AdminCard,
  AdminPagination,
  AdminThumb,
  EmptyCard,
  FilterTabs,
  InfoList,
  InfoRow,
  SearchBox,
  StatusBadge,
} from "@/features/admin/components/admin-ui";
import { ListingActions } from "@/features/admin/components/listing-actions";
import { LISTING_FLAGS, LISTING_STATUS, LISTING_TYPE } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange, searchTerm } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "İlan moderasyonu" };

const PAGE_SIZE = 20;
const TABS = [
  { value: "pending_review", label: "Onay bekleyen" },
  { value: "isaretli", label: "İşaretli" },
  { value: "active", label: "Yayında" },
  { value: "rejected", label: "Reddedilen" },
  { value: "paused", label: "Durdurulan" },
  { value: "expired", label: "Süresi dolan" },
  { value: "deleted", label: "Silinen" },
  { value: "tumu", label: "Tümü" },
] as const;
type TabValue = (typeof TABS)[number]["value"];
const TYPES = ["tumu", "classified", "job"] as const;

const SELECT =
  "id,type,title,description,price_try,status,flags,rejection_reason,created_at,published_at,expires_at,attributes,is_demo," +
  "job_salary_min,job_salary_max,job_salary_hidden,job_location_label," +
  "owner:profiles!listings_owner_id_fkey(id,full_name,phone,trusted_publisher,status)," +
  "business:businesses(id,name,slug,status),listing_categories(name,slug,is_banned),neighbourhoods(name),listing_media(url,thumb_url,sort)";

type ListingRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  price_try: number | null;
  status: string;
  flags: string[];
  rejection_reason: string | null;
  created_at: string;
  published_at: string | null;
  expires_at: string;
  attributes: unknown;
  is_demo: boolean;
  job_salary_min: number | null;
  job_salary_max: number | null;
  job_salary_hidden: boolean;
  job_location_label: string | null;
  owner: { id: string; full_name: string | null; phone: string | null; trusted_publisher: boolean; status: string } | null;
  business: { id: string; name: string; slug: string; status: string } | null;
  listing_categories: { name: string; slug: string; is_banned: boolean } | null;
  neighbourhoods: { name: string } | null;
  listing_media: Array<{ url: string; thumb_url: string | null; sort: number }>;
};

function attributeText(v: unknown): string {
  if (v === true) return "Evet";
  if (v === false) return "Hayır";
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "");
}

export default async function AdminListingsPage({ searchParams }: PageProps<"/admin/ilanlar">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<TabValue>(sp.durum, TABS.map((t) => t.value), "pending_review");
  const type = oneOf(sp.tur, TYPES, "tumu");
  const q = searchTerm(sp.q);
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  const applyTab = <T extends { eq: (c: string, v: string) => T; neq: (c: string, v: string) => T; not: (c: string, op: string, v: string) => T }>(
    query: T,
    value: TabValue,
  ): T => {
    if (value === "tumu") return query;
    if (value === "isaretli") return query.not("flags", "eq", "{}").neq("status", "deleted");
    return query.eq("status", value);
  };

  let listQuery = supabase.from("listings").select(SELECT, { count: "exact" });
  listQuery = applyTab(listQuery, tab);
  if (type !== "tumu") listQuery = listQuery.eq("type", type);
  if (q) listQuery = listQuery.ilike("title", `%${q}%`);
  const { from, to } = pageRange(page, PAGE_SIZE);
  listQuery = listQuery.order("created_at", { ascending: tab === "pending_review" }).range(from, to);

  const countFor = async (value: TabValue) => {
    let c = supabase.from("listings").select("id", { count: "exact", head: true });
    c = applyTab(c, value);
    if (type !== "tumu") c = c.eq("type", type);
    const { count } = await c;
    return count ?? 0;
  };

  const [{ data, count, error }, ...counts] = await Promise.all([listQuery, ...TABS.map((t) => countFor(t.value))]);
  const rows = (data ?? []) as unknown as ListingRow[];
  const baseQuery = { durum: tab === "pending_review" ? undefined : tab, tur: type === "tumu" ? undefined : type, q };

  return (
    <>
      <AdminPageHeader
        title="İlan moderasyonu"
        description="İlk 3 ilan ve işaretli ilanlar onaya düşer. Onaylanan ilan 30 gün yayında kalır; ret gerekçesi ilan sahibine bildirilir."
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="İlan durumu"
          items={TABS.map((t, i) => ({
            label: t.label,
            count: counts[i],
            active: t.value === tab,
            href: withQuery(routes.admin.listings(), { ...baseQuery, durum: t.value === "pending_review" ? undefined : t.value, sayfa: undefined }),
          }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            ariaLabel="İlan türü"
            items={TYPES.map((t) => ({
              label: t === "tumu" ? "Tüm türler" : LISTING_TYPE[t].label,
              active: t === type,
              href: withQuery(routes.admin.listings(), { ...baseQuery, tur: t === "tumu" ? undefined : t }),
            }))}
          />
          <SearchBox
            action={routes.admin.listings()}
            defaultValue={q}
            placeholder="Başlıkta ara"
            label="İlan başlığında ara"
            hidden={{ durum: baseQuery.durum, tur: baseQuery.tur }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="İlanlar yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState
              icon={CheckCircle2}
              title={tab === "pending_review" ? "Onay bekleyen ilan yok" : "Bu filtrede ilan yok"}
              description={tab === "pending_review" ? "Yeni ilanlar geldiğinde burada sırayla listelenir." : "Farklı bir durum ya da tür seçebilirsin."}
            />
          </EmptyCard>
        ) : (
          rows.map((l) => {
            const isPublic = l.status === "active" || l.status === "sold" || l.status === "filled";
            const publicHref = isPublic ? publicUrl(l.type === "job" ? routes.listings.job(l.id) : routes.listings.classified(l.id)) : null;
            const media = [...(l.listing_media ?? [])].sort((a, b) => a.sort - b.sort);
            const attrs = l.attributes && typeof l.attributes === "object" && !Array.isArray(l.attributes) ? Object.entries(l.attributes as Record<string, unknown>) : [];
            return (
              <AdminCard key={l.id} as="article">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={LISTING_STATUS} value={l.status} />
                      <StatusBadge map={LISTING_TYPE} value={l.type} />
                      {l.is_demo ? <DemoBadge /> : null}
                    </div>
                    <h2 className="mt-2 text-lg leading-snug font-bold break-words">{l.title}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {l.type === "job"
                        ? l.job_salary_hidden
                          ? "Maaş gizli"
                          : formatPriceRange(l.job_salary_min, l.job_salary_max, { fallback: "Maaş belirtilmemiş" })
                        : formatPrice(l.price_try)}
                      {" · "}
                      {formatRelativeTime(l.created_at)}
                    </p>
                  </div>
                </div>

                {l.flags.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Uyarılar">
                    {l.flags.map((f) => (
                      <li key={f}>
                        <Badge variant="warning" className="h-7 px-2.5" title={LISTING_FLAGS[f]?.description}>
                          <TriangleAlert aria-hidden /> {LISTING_FLAGS[f]?.label ?? f}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {media.length > 0 ? (
                  <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" aria-label="Fotoğraflar">
                    {media.map((m, i) => (
                      <li key={m.url}>
                        <a href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`Fotoğraf ${i + 1} (yeni sekmede)`}>
                          <AdminThumb src={m.thumb_url ?? m.url} size={88} />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Fotoğraf eklenmemiş.</p>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <InfoList>
                    <InfoRow label="Kategori">
                      {l.listing_categories?.name ?? "-"}
                      {l.listing_categories?.is_banned ? (
                        <Badge variant="destructive" className="ml-2">
                          Yasaklı kategori
                        </Badge>
                      ) : null}
                    </InfoRow>
                    <InfoRow label="Konum">{l.type === "job" ? l.job_location_label ?? l.neighbourhoods?.name ?? "-" : l.neighbourhoods?.name ?? "-"}</InfoRow>
                    <InfoRow label="Oluşturma">{formatDateTime(l.created_at)}</InfoRow>
                    {l.published_at ? <InfoRow label="Yayın bitişi">{formatDateTime(l.expires_at)}</InfoRow> : null}
                    {attrs.map(([k, v]) => (
                      <InfoRow key={k} label={k}>
                        {attributeText(v)}
                      </InfoRow>
                    ))}
                  </InfoList>
                  <InfoList>
                    <InfoRow label="İlan sahibi">
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="size-4 text-muted-foreground" aria-hidden />
                        {l.owner?.full_name ?? "İsimsiz"}
                      </span>
                      {l.owner?.trusted_publisher ? (
                        <Badge variant="verified" className="ml-2">
                          Güvenilir
                        </Badge>
                      ) : null}
                      {l.owner && l.owner.status !== "active" ? (
                        <Badge variant="destructive" className="ml-2">
                          {l.owner.status === "banned" ? "Engelli" : "Kısıtlı"}
                        </Badge>
                      ) : null}
                    </InfoRow>
                    <InfoRow label="Telefon">
                      {l.owner?.phone ? (
                        <a className="text-primary underline-offset-4 hover:underline" href={withQuery(routes.admin.users(), { q: l.owner.phone.replace(/^\+90/, "") })}>
                          {formatPhoneTR(l.owner.phone)}
                        </a>
                      ) : (
                        "-"
                      )}
                    </InfoRow>
                    {l.business ? (
                      <InfoRow label="İşletme">
                        <span className="inline-flex items-center gap-1.5">
                          <Store className="size-4 text-muted-foreground" aria-hidden />
                          {l.business.name}
                        </span>
                      </InfoRow>
                    ) : null}
                    {l.rejection_reason ? <InfoRow label="Ret gerekçesi">{l.rejection_reason}</InfoRow> : null}
                  </InfoList>
                </div>

                {l.description ? (
                  <details className="group mt-4 rounded-xl bg-muted/50 p-3 text-sm">
                    <summary className="cursor-pointer font-semibold select-none">Açıklama</summary>
                    <p className="mt-2 leading-relaxed break-words whitespace-pre-line">{l.description}</p>
                  </details>
                ) : null}

                <div className="mt-4 border-t pt-4">
                  <ListingActions listingId={l.id} status={l.status} title={l.title} publicHref={publicHref} />
                </div>
              </AdminCard>
            );
          })
        )}
      </div>

      <AdminPagination path={routes.admin.listings()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
