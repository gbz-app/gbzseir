import type { Metadata } from "next";
import { MapPin, Phone, Star, Store, TriangleAlert, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge, VerifiedBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { formatDateTime, formatNumber, formatPhoneTR, formatRelativeTime } from "@/core/format";
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
import { BusinessActions, DocumentButton } from "@/features/admin/components/business-actions";
import { BUSINESS_DOC_KINDS, BUSINESS_KINDS, BUSINESS_STATUS } from "@/features/admin/lib/labels";
import { oneOf, pageParam, pageRange, searchTerm } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "İşletmeler" };

const PAGE_SIZE = 20;
const TABS = ["basvurular", "tumu"] as const;
const STATUSES = ["tumu", "approved", "suspended", "rejected", "pending"] as const;
type StatusFilter = (typeof STATUSES)[number];

const SELECT =
  "id,slug,name,kinds,category_label,phone,address,description,status,rejection_reason,verification_level,vacation_mode,logo_url,cover_url,working_hours,lat,lng,rating_avg,rating_count,leads_accepted_count,is_demo,created_at,updated_at,approved_at," +
  "owner:profiles!businesses_owner_id_fkey(id,full_name,phone,status),neighbourhoods!businesses_neighbourhood_id_fkey(name)," +
  "business_service_categories(service_categories(id,name)),business_service_areas(neighbourhoods(id,name)),business_documents(id,kind,path,created_at),business_photos(url,sort)";

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  kinds: string[];
  category_label: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  status: string;
  rejection_reason: string | null;
  verification_level: number;
  vacation_mode: boolean;
  logo_url: string | null;
  cover_url: string | null;
  working_hours: unknown;
  lat: number | null;
  lng: number | null;
  rating_avg: number;
  rating_count: number;
  leads_accepted_count: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  owner: { id: string; full_name: string | null; phone: string | null; status: string } | null;
  neighbourhoods: { name: string } | null;
  business_service_categories: Array<{ service_categories: { id: string; name: string } | null }>;
  business_service_areas: Array<{ neighbourhoods: { id: string; name: string } | null }>;
  business_documents: Array<{ id: string; kind: string; path: string; created_at: string }>;
  business_photos: Array<{ url: string; sort: number }>;
};

const DAYS: Array<[string, string]> = [
  ["mon", "Pzt"],
  ["tue", "Sal"],
  ["wed", "Çar"],
  ["thu", "Per"],
  ["fri", "Cum"],
  ["sat", "Cmt"],
  ["sun", "Paz"],
];

function hoursText(wh: unknown): string {
  if (!wh || typeof wh !== "object") return "Belirtilmemiş";
  const obj = wh as Record<string, { open?: string; close?: string } | null>;
  if (Object.keys(obj).length === 0) return "Belirtilmemiş";
  return DAYS.map(([k, label]) => {
    const d = obj[k];
    return `${label} ${d?.open && d?.close ? `${d.open}-${d.close}` : "kapalı"}`;
  }).join(" · ");
}

function BusinessDetails({ b }: { b: BusinessRow }) {
  const categories = b.business_service_categories.map((c) => c.service_categories).filter(Boolean) as Array<{ id: string; name: string }>;
  const areas = b.business_service_areas.map((a) => a.neighbourhoods).filter(Boolean) as Array<{ id: string; name: string }>;
  const photos = [...b.business_photos].sort((x, y) => x.sort - y.sort);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoList>
          <InfoRow label="Roller">{b.kinds.map((k) => BUSINESS_KINDS[k] ?? k).join(", ") || "-"}</InfoRow>
          <InfoRow label="Kategori etiketi">{b.category_label ?? "-"}</InfoRow>
          <InfoRow label="İşletme telefonu">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-4 text-muted-foreground" aria-hidden /> {formatPhoneTR(b.phone) || "-"}
            </span>
          </InfoRow>
          <InfoRow label="Adres">
            <span className="inline-flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {[b.address, b.neighbourhoods?.name ? `${b.neighbourhoods.name} Mah.` : null].filter(Boolean).join(", ") || "-"}
                {b.lat && b.lng ? (
                  <a
                    className="ml-2 text-primary underline-offset-4 hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=17/${b.lat}/${b.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Haritada gör
                  </a>
                ) : null}
              </span>
            </span>
          </InfoRow>
          <InfoRow label="Çalışma saatleri">{hoursText(b.working_hours)}</InfoRow>
        </InfoList>
        <InfoList>
          <InfoRow label="Başvuran">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4 text-muted-foreground" aria-hidden /> {b.owner?.full_name ?? "İsimsiz"}
            </span>
            {b.owner && b.owner.status !== "active" ? (
              <Badge variant="destructive" className="ml-2">
                {b.owner.status === "banned" ? "Engelli" : "Kısıtlı"}
              </Badge>
            ) : null}
          </InfoRow>
          <InfoRow label="Başvuran telefonu">
            {b.owner?.phone ? (
              <a className="text-primary underline-offset-4 hover:underline" href={withQuery(routes.admin.users(), { q: b.owner.phone.replace(/^\+90/, "") })}>
                {formatPhoneTR(b.owner.phone)}
              </a>
            ) : (
              "-"
            )}
          </InfoRow>
          <InfoRow label="Başvuru">{formatDateTime(b.created_at)}</InfoRow>
          {b.approved_at ? <InfoRow label="Onay">{formatDateTime(b.approved_at)}</InfoRow> : null}
          <InfoRow label="Puan">
            <span className="inline-flex items-center gap-1">
              <Star className="size-4 text-highlight" aria-hidden /> {b.rating_count ? `${formatNumber(b.rating_avg, 1)} (${b.rating_count} yorum)` : "Henüz yorum yok"}
            </span>
          </InfoRow>
          <InfoRow label="Kabul edilen iş">{formatNumber(b.leads_accepted_count)}</InfoRow>
          {b.rejection_reason ? <InfoRow label="Ret gerekçesi">{b.rejection_reason}</InfoRow> : null}
        </InfoList>
      </div>

      {b.description ? <p className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed break-words whitespace-pre-line">{b.description}</p> : null}

      {b.kinds.includes("service") ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Hizmet kategorileri</h3>
            {categories.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Badge variant="info" className="h-6 px-2.5">
                      {c.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-destructive">Kategori seçilmemiş.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Hizmet bölgeleri</h3>
            {areas.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {areas.map((a) => (
                  <li key={a.id}>
                    <Badge variant="secondary" className="h-6 px-2.5">
                      {a.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Bölge seçilmemiş.</p>
            )}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Belgeler</h3>
        {b.business_documents.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {b.business_documents.map((d) => (
              <li key={d.id}>
                <DocumentButton documentId={d.id} label={BUSINESS_DOC_KINDS[d.kind] ?? "Belge"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Belge yüklenmemiş.</p>
        )}
      </div>

      {photos.length || b.cover_url ? (
        <div>
          <h3 className="text-sm font-semibold">Görseller</h3>
          <ul className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto">
            {[b.cover_url, ...photos.map((p) => p.url)].filter(Boolean).map((u, i) => (
              <li key={`${u}-${i}`}>
                <a href={u!} target="_blank" rel="noopener noreferrer" aria-label={`Görsel ${i + 1} (yeni sekmede)`}>
                  <AdminThumb src={u} size={88} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminBusinessesPage({ searchParams }: PageProps<"/admin/isletmeler">) {
  await requireAdmin();
  const sp = await searchParams;
  // Businesses go live on creation, so the full list (newest first) is the default; "Yayında değil" keeps the rare
  // unfinished (pending) ones.
  const tab = oneOf(sp.sekme, TABS, "tumu");
  const status = oneOf<StatusFilter>(sp.durum, STATUSES, "tumu");
  const q = searchTerm(sp.q);
  const page = pageParam(sp.sayfa);
  const supabase = await createClient();

  let query = supabase.from("businesses").select(SELECT, { count: "exact" });
  if (tab === "basvurular") query = query.eq("status", "pending").order("created_at", { ascending: true });
  else {
    if (status !== "tumu") query = query.eq("status", status);
    query = query.order("created_at", { ascending: false });
  }
  if (q) query = query.ilike("name", `%${q}%`);
  const { from, to } = pageRange(page, PAGE_SIZE);

  const [{ data, count, error }, pendingCount, allCount] = await Promise.all([
    query.range(from, to),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("businesses").select("id", { count: "exact", head: true }),
  ]);
  const rows = (data ?? []) as unknown as BusinessRow[];
  const baseQuery = { sekme: tab === "tumu" ? undefined : tab, durum: tab === "tumu" && status !== "tumu" ? status : undefined, q };
  const statusLabel: Record<StatusFilter, string> = { tumu: "Tüm durumlar", approved: "Onaylı", suspended: "Askıda", rejected: "Reddedilen", pending: "Bekleyen" };

  return (
    <>
      <AdminPageHeader
        title="İşletmeler"
        description="İşletmeler açıldığı anda yayına girer; uygunsuz olanları askıya alabilirsin. Belgeler 2 dakikalık güvenli bağlantıyla açılır."
      />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="İşletme sekmeleri"
          items={[
            { label: "Tüm işletmeler", count: allCount.count ?? 0, active: tab === "tumu", href: withQuery(routes.admin.businesses(), { q }) },
            { label: "Yayında değil", count: pendingCount.count ?? 0, active: tab === "basvurular", href: withQuery(routes.admin.businesses(), { sekme: "basvurular", q }) },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {tab === "tumu" ? (
            <FilterTabs
              ariaLabel="İşletme durumu"
              items={STATUSES.map((s) => ({
                label: statusLabel[s],
                active: s === status,
                href: withQuery(routes.admin.businesses(), { ...baseQuery, durum: s === "tumu" ? undefined : s }),
              }))}
            />
          ) : (
            <span />
          )}
          <SearchBox
            action={routes.admin.businesses()}
            defaultValue={q}
            placeholder="İşletme adında ara"
            label="İşletme adında ara"
            hidden={{ sekme: baseQuery.sekme, durum: baseQuery.durum }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="İşletmeler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState
              icon={Store}
              title={tab === "basvurular" ? "Yayında olmayan işletme yok" : "Bu filtrede işletme yok"}
              description={tab === "basvurular" ? "Sahibi bilgilerini tamamlamamış işletmeler burada görünür." : undefined}
            />
          </EmptyCard>
        ) : (
          rows.map((b) => {
            const publicHref = b.status === "approved" ? publicUrl(routes.businesses.detail(b.slug)) : null;
            return (
              <AdminCard key={b.id} as="article">
                <div className="flex items-start gap-3">
                  <AdminThumb src={b.logo_url} size={56} alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge map={BUSINESS_STATUS} value={b.status} />
                      {b.verification_level >= 1 ? <VerifiedBadge label={`Onaylı · ${b.verification_level}`} /> : null}
                      {b.vacation_mode ? <Badge variant="secondary">Tatilde</Badge> : null}
                      {b.is_demo ? <DemoBadge /> : null}
                    </div>
                    <h2 className="mt-1.5 text-lg leading-snug font-bold break-words">{b.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {b.kinds.map((k) => BUSINESS_KINDS[k] ?? k).join(", ")} · {"Açılış "}
                      {formatRelativeTime(b.created_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  {tab === "basvurular" ? (
                    <BusinessDetails b={b} />
                  ) : (
                    <details className="group">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary select-none">Ayrıntıları göster</summary>
                      <div className="mt-2">
                        <BusinessDetails b={b} />
                      </div>
                    </details>
                  )}
                </div>

                <div className="mt-4 border-t pt-4">
                  <BusinessActions businessId={b.id} name={b.name} status={b.status} verificationLevel={b.verification_level} publicHref={publicHref} />
                </div>
              </AdminCard>
            );
          })
        )}
      </div>
      <AdminPagination path={routes.admin.businesses()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </>
  );
}
