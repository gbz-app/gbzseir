import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  Activity,
  Flag,
  FolderTree,
  History,
  LifeBuoy,
  LogIn,
  MapPinned,
  Megaphone,
  Newspaper,
  Scale,
  ScrollText,
  Settings,
  Smartphone,
  Star,
  Store,
  Tag,
  Ticket,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatNumber } from "@/core/format";
import { routes, type QueryRecord } from "@/core/routes";
import { addDaysToKey, istanbulDateTime } from "@/core/time";
import { AdminCard, AdminPagination, EmptyCard, FilterTabs, InfoList, InfoRow } from "@/features/admin/components/admin-ui";
import { one, oneOf, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "İşlem kaydı" };

const PAGE_SIZE = 50;
const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Action groups (?tur=) -> audit_log.action prefixes. */
const GROUPS = {
  ayarlar: { label: "Ayarlar", prefixes: ["settings."], icon: Settings },
  kategoriler: { label: "Kategoriler", prefixes: ["service_category.", "listing_category.", "flow."], icon: FolderTree },
  icerik: { label: "Haber, duyuru, yer", prefixes: ["news_article.", "announcement.", "place.", "legal_text."], icon: Newspaper },
  sikayet: { label: "Şikayetler", prefixes: ["report."], icon: Flag },
  destek: { label: "Destek", prefixes: ["support."], icon: LifeBuoy },
  isletme: { label: "İşletmeler", prefixes: ["business."], icon: Store },
  ilan: { label: "İlanlar", prefixes: ["listing."], icon: Tag },
  etkinlik: { label: "Etkinlikler", prefixes: ["event."], icon: Ticket },
  yorum: { label: "Yorumlar", prefixes: ["review."], icon: Star },
  hesap: { label: "Hesaplar", prefixes: ["profile."], icon: UserRound },
  giris: { label: "Girişler", prefixes: ["auth."], icon: LogIn },
  muhasebe: { label: "Muhasebe", prefixes: ["finance."], icon: Wallet },
  magaza: { label: "Mağaza verisi", prefixes: ["store_stat."], icon: Smartphone },
} satisfies Record<string, { label: string; prefixes: string[]; icon: LucideIcon }>;
type GroupKey = keyof typeof GROUPS;
type TurFilter = "tumu" | GroupKey;
const TURS: TurFilter[] = ["tumu", ...(Object.keys(GROUPS) as GroupKey[])];

/** Finer icons inside a group. */
const ACTION_ICONS: Array<[string, LucideIcon]> = [
  ["place.", MapPinned],
  ["announcement.", Megaphone],
  ["legal_text.", Scale],
];

function iconFor(action: string): LucideIcon {
  const own = ACTION_ICONS.find(([p]) => action.startsWith(p))?.[1];
  if (own) return own;
  return Object.values(GROUPS).find((g) => g.prefixes.some((p) => action.startsWith(p)))?.icon ?? Activity;
}

/** ?kim= -> admin_audit_log p_actor. */
const ACTORS: Record<string, string> = { yonetici: "admin", sistem: "system", kullanici: "user" };

const ENTITY_LABELS: Record<string, string> = {
  settings: "Ayar",
  profile: "Hesap",
  business: "İşletme",
  listing: "İlan",
  support: "Destek mesajı",
  report: "Şikayet",
  event: "Etkinlik",
  finance: "Muhasebe kaydı",
  service_category: "Hizmet kategorisi",
  listing_category: "İlan kategorisi",
  flow: "Soru akışı",
  news_article: "Haber yazısı",
  announcement: "Duyuru",
  place: "Yer",
  legal_text: "Yasal metin",
  store_stat: "Mağaza verisi",
};

const DETAIL_LABELS: Record<string, string> = {
  from: "Önce",
  to: "Sonra",
  fields: "Değişen alanlar",
  reason: "Gerekçe",
  key: "Ayar anahtarı",
  note: "Not",
  rating: "Puan",
  kind: "Tür",
  amount: "Tutar",
  date: "Tarih",
  status: "Durum",
  provider: "Giriş yöntemi",
  phone: "Telefon",
  target_type: "Şikayet edilen",
  target_id: "Hedef kimliği",
  review_id: "Yorum kimliği",
};

type AuditRow = {
  id: number;
  at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_exists: boolean;
  user_id: string | null;
  user_name: string | null;
  user_exists: boolean;
};
type AuditResult = { total: number; rows: AuditRow[]; admins: Array<{ id: string; name: string | null }> };

/** A real calendar day (YYYY-MM-DD); "2026-13-01" or "2026-02-31" are rejected. */
function dayParam(v: string | undefined): string | undefined {
  return v && DAY.test(v) && addDaysToKey(v, 0) === v ? v : undefined;
}

function detailValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  if (Array.isArray(v)) return v.map(detailValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v).slice(0, 300);
  return String(v).slice(0, 300);
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** İşlem kaydı: yönetici, sistem ve kullanıcı işlemleri (audit_log), en yenisi üstte; filtre ve sayfalama. */
export default async function AdminAuditPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tur = oneOf<TurFilter>(sp.tur, TURS, "tumu");
  const kimRaw = one(sp.kim);
  const kimGroup = kimRaw && Object.hasOwn(ACTORS, kimRaw) ? ACTORS[kimRaw] : undefined;
  const kim = kimRaw && (kimGroup || UUID.test(kimRaw)) ? kimRaw : undefined;
  const kullanici = one(sp.kullanici);
  const user = kullanici && UUID.test(kullanici) ? kullanici : undefined;
  const hedefRaw = one(sp.hedef);
  const target = hedefRaw && UUID.test(hedefRaw) ? hedefRaw : undefined;
  const q = one(sp.q)?.slice(0, 80);
  const bas = dayParam(one(sp.bas));
  const bit = dayParam(one(sp.bit));
  const page = pageParam(sp.sayfa);
  const { from } = pageRange(page, PAGE_SIZE);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_prefixes: tur === "tumu" ? undefined : GROUPS[tur].prefixes,
    p_actor: kim ? (kimGroup ?? kim) : undefined,
    p_user: user,
    p_entity_id: target,
    p_q: q,
    p_from: bas ? istanbulDateTime(bas).toISOString() : undefined,
    p_to: bit ? istanbulDateTime(addDaysToKey(bit, 1)).toISOString() : undefined,
    p_limit: PAGE_SIZE,
    p_offset: from,
  });
  const result = (data as unknown as AuditResult | null) ?? { total: 0, rows: [], admins: [] };
  const rows = result.rows ?? [];

  const baseQuery: QueryRecord = { tur: tur === "tumu" ? undefined : tur, kim, kullanici: user, hedef: target, q, bas, bit };
  const hrefWith = (patch: QueryRecord) => routes.admin.audit({ ...baseQuery, ...patch, sayfa: undefined });
  const hasFilters = Boolean(kim || user || target || q || bas || bit || tur !== "tumu");

  return (
    <>
      <AdminPageHeader
        title="İşlem kaydı"
        description="Yöneticilerin, sistemin ve kullanıcıların yaptığı değişiklikler: ayarlar, kategoriler, şikayet ve destek kararları, içerik, muhasebe, hesap hareketleri. En yenisi üstte."
      />

      <div className="grid gap-3">
        <FilterTabs
          ariaLabel="İşlem türü"
          items={TURS.map((t) => ({
            label: t === "tumu" ? "Tümü" : GROUPS[t].label,
            active: t === tur,
            href: hrefWith({ tur: t === "tumu" ? undefined : t }),
          }))}
        />
        <Form action={routes.admin.audit()} className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          {tur !== "tumu" ? <input type="hidden" name="tur" value={tur} /> : null}
          {user ? <input type="hidden" name="kullanici" value={user} /> : null}
          {target ? <input type="hidden" name="hedef" value={target} /> : null}
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground lg:w-52">
            Kim yaptı
            <select name="kim" defaultValue={kim ?? ""} className={SELECT}>
              <option value="">Herkes</option>
              <option value="yonetici">Yöneticiler</option>
              <option value="kullanici">Kullanıcılar</option>
              <option value="sistem">Sistem</option>
              {result.admins.length > 1
                ? result.admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      Yönetici: {a.name || "İsimsiz"}
                    </option>
                  ))
                : null}
              {kim && !kimGroup && !(result.admins.length > 1 && result.admins.some((a) => a.id === kim)) ? (
                <option value={kim}>Seçili kişi (#{kim.slice(0, 8).toUpperCase()})</option>
              ) : null}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground lg:w-40">
            Başlangıç
            <Input type="date" name="bas" defaultValue={bas} className="h-10" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground lg:w-40">
            Bitiş
            <Input type="date" name="bit" defaultValue={bit} className="h-10" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground lg:w-64">
            Hedef ara
            <Input type="search" name="q" defaultValue={q} placeholder="İşletme, başlık, ayar adı..." maxLength={80} className="h-10" />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variant="outline" className="h-10 flex-1 lg:flex-none">
              Uygula
            </Button>
            {hasFilters ? (
              <Button asChild variant="ghost" className="h-10">
                <Link href={routes.admin.audit()}>Temizle</Link>
              </Button>
            ) : null}
          </div>
        </Form>
        {user || target ? (
          <div className="flex flex-wrap gap-2">
            {user ? (
              <Link href={hrefWith({ kullanici: undefined })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-semibold hover:bg-muted/70">
                Hesap: #{user.slice(0, 8).toUpperCase()} <X className="size-3.5" aria-label="Filtreyi kaldır" />
              </Link>
            ) : null}
            {target ? (
              <Link href={hrefWith({ hedef: undefined })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-semibold hover:bg-muted/70">
                Hedef: #{target.slice(0, 8).toUpperCase()} <X className="size-3.5" aria-label="Filtreyi kaldır" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="İşlem kaydı yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={ScrollText} title="Bu filtrede kayıt yok" description={hasFilters ? "Filtreleri değiştirip tekrar dene." : undefined} />
          </EmptyCard>
        ) : (
          <AdminCard title={`${formatNumber(result.total)} kayıt`} bodyClassName="px-4 py-1">
            <ol className="divide-y">
              {rows.map((r) => {
                const Icon = iconFor(r.action);
                const details = Object.entries(r.details ?? {}).filter(([k, v]) => k !== "name" && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
                const actorName = r.actor_exists ? r.actor_name || "İsimsiz" : "Silinmiş hesap";
                const self = r.actor_id !== null && r.actor_id === r.user_id;
                return (
                  <li key={r.id} className="flex gap-3 py-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">{r.summary}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <time dateTime={r.at}>{formatDateTime(r.at)}</time>
                        <span aria-hidden>·</span>
                        {r.actor_id ? (
                          <Link href={hrefWith({ kim: r.actor_id })} className="hover:text-foreground hover:underline">
                            {r.actor_role === "admin" ? `Yönetici: ${actorName}` : self ? `${actorName} (kendisi)` : actorName}
                          </Link>
                        ) : (
                          <span>Sistem</span>
                        )}
                        {r.user_id && !self ? (
                          <>
                            <span aria-hidden>·</span>
                            {r.user_exists ? (
                              <Link href={routes.admin.user(r.user_id)} className="text-primary hover:underline">
                                Hesap: {r.user_name || "İsimsiz"}
                              </Link>
                            ) : (
                              <span>Hesap: silinmiş</span>
                            )}
                          </>
                        ) : null}
                        {r.entity_id && r.entity_id !== target ? (
                          <>
                            <span aria-hidden>·</span>
                            <Link href={hrefWith({ hedef: r.entity_id })} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                              <History className="size-3" aria-hidden />
                              {ENTITY_LABELS[r.entity_type ?? ""] ?? "Kayıt"} geçmişi
                            </Link>
                          </>
                        ) : null}
                      </p>
                      {details.length ? (
                        <details className="mt-1.5 text-xs">
                          <summary className="cursor-pointer font-semibold text-muted-foreground select-none hover:text-foreground">Ayrıntılar</summary>
                          <InfoList className="mt-2 rounded-xl bg-muted/50 p-3 text-xs">
                            {details.map(([k, v]) => (
                              <InfoRow key={k} label={DETAIL_LABELS[k] ?? k}>
                                {detailValue(v)}
                              </InfoRow>
                            ))}
                          </InfoList>
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </AdminCard>
        )}
      </div>
      <AdminPagination path={routes.admin.audit()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={result.total ?? 0} />
    </>
  );
}
