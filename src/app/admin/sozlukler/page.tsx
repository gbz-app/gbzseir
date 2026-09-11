import type { Metadata } from "next";
import { ExternalLink, Pencil, Plus, TriangleAlert } from "lucide-react";
import { publicUrl } from "@/config/app-mode";
import { requireAdmin } from "@/lib/auth/server";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/core/format";
import { routes } from "@/core/routes";
import { BUSINESS_VERTICALS, DEFAULT_EVENT_CATEGORY, LISTABLE_VERTICALS, VERTICAL_INFO, parseVertical, subcategoryMatcher, type Vertical } from "@/features/business/lib/verticals";
import { AdminCard, EmptyCard, FilterTabs } from "@/features/admin/components/admin-ui";
import {
  AmenityEditor,
  EventCategoryEditor,
  SubcategoryEditor,
  VocabIconView,
  type AmenityScope,
  type AmenityValue,
  type EventCategoryValue,
  type SubcategoryValue,
} from "@/features/admin/components/vocabulary-editor";
import { oneOf } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Kategori sözlükleri" };

const TABS = ["chipler", "olanaklar", "etkinlik"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { chipler: "Keşfet chipleri", olanaklar: "Olanaklar", etkinlik: "Etkinlik kategorileri" };
const SCOPES = ["isletme", "oda"] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function LoadError() {
  return (
    <EmptyCard>
      <EmptyState icon={TriangleAlert} tone="warning" title="Sözlükler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
    </EmptyCard>
  );
}

const editButton = (label: string) => (
  <Button variant="ghost" size="icon" aria-label={`${label} düzenle`}>
    <Pencil />
  </Button>
);

/** Kategori sözlükleri: keşfet chipleri, işletme olanakları, oda özellikleri ve etkinlik kategorileri. */
export default async function AdminVocabulariesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "chipler");
  const supabase = await createClient();

  return (
    <>
      <AdminPageHeader
        title="Kategori sözlükleri"
        description="Keşfet listelerindeki alt kategori chiplerini, işletme ve oda olanaklarını ve etkinlik kategorilerini düzenle. Değişiklik uygulamada birkaç saniyede görünür; yeni sürüm gerekmez."
      />
      <FilterTabs ariaLabel="Sözlük" items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: routes.admin.vocabularies({ sekme: t === "chipler" ? undefined : t }) }))} />
      <div className="mt-5 grid gap-4">
        {tab === "chipler" ? (
          <ChipsSection supabase={supabase} vertical={oneOf<Vertical>(sp.tur, LISTABLE_VERTICALS, "yemek")} />
        ) : tab === "olanaklar" ? (
          <AmenitiesSection supabase={supabase} scope={oneOf(sp.kapsam, SCOPES, "isletme") === "oda" ? "room" : "business"} />
        ) : (
          <EventCategoriesSection supabase={supabase} />
        )}
      </div>
    </>
  );
}

async function ChipsSection({ supabase, vertical }: { supabase: ServerSupabase; vertical: Vertical }) {
  const [chips, firms] = await Promise.all([
    supabase.from("vertical_subcategories").select("id,key,label,keywords,exclude,sort,active").eq("vertical", vertical).order("sort").order("label"),
    // The rows of the public list (listVerticalBusinesses): approved businesses of the vertical, at most 300.
    supabase.from("businesses").select("name,category_label,description").eq("status", "approved").eq("vertical", vertical).limit(300),
  ]);
  const info = VERTICAL_INFO[vertical];
  const texts = (firms.data ?? []).map((b) => `${b.category_label ?? ""} ${b.name} ${b.description ?? ""}`);
  const rows: SubcategoryValue[] = (chips.data ?? []).map((r) => ({
    id: r.id,
    vertical,
    key: r.key,
    label: r.label,
    keywords: r.keywords,
    exclude: r.exclude,
    sort: r.sort,
    active: r.active,
  }));

  return (
    <>
      <FilterTabs
        ariaLabel="İşletme türü"
        items={LISTABLE_VERTICALS.map((v) => ({ label: VERTICAL_INFO[v].label, active: v === vertical, href: routes.admin.vocabularies({ tur: v === "yemek" ? undefined : v }) }))}
      />
      {chips.error ? (
        <LoadError />
      ) : (
        <AdminCard
          title={`${info.plural} chipleri`}
          description={`Keşfet listesinin üstündeki alt kategoriler, soldan sağa sıra değerine göre. İşletme sayıları ${formatNumber(texts.length)} onaylı işletmeye göre.`}
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <a href={publicUrl(routes.businesses.vertical(vertical))} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Sayfayı aç
                </a>
              </Button>
              <SubcategoryEditor
                vertical={vertical}
                trigger={
                  <Button size="sm">
                    <Plus /> Chip ekle
                  </Button>
                }
              />
            </>
          }
        >
          {rows.length ? (
            <ul className="divide-y">
              {rows.map((c) => {
                const matches = subcategoryMatcher(c);
                const count = texts.filter((t) => matches(t)).length;
                return (
                  <li key={c.id} className="flex items-start gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{c.label}</span>
                        {c.active ? null : <Badge variant="secondary">Pasif</Badge>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {c.keywords.join(", ")}
                        {c.exclude.length ? ` · hariç: ${c.exclude.join(", ")}` : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        sıra {c.sort} · {formatNumber(count)} işletme
                      </span>
                    </span>
                    <SubcategoryEditor vertical={vertical} item={c} trigger={editButton(c.label)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Bu türde chip yok; listede yalnızca Tümü görünür.</p>
          )}
        </AdminCard>
      )}
    </>
  );
}

async function AmenitiesSection({ supabase, scope }: { supabase: ServerSupabase; scope: AmenityScope }) {
  const room = scope === "room";
  const [list, usage] = await Promise.all([
    supabase.from("amenities").select("id,key,label,icon,verticals,sort,active").eq("scope", scope).order("sort").order("label"),
    room ? supabase.from("business_rooms").select("amenities").limit(5000) : supabase.from("businesses").select("amenities").limit(5000),
  ]);
  const used = new Map<string, number>();
  for (const r of usage.data ?? []) for (const k of r.amenities ?? []) used.set(k, (used.get(k) ?? 0) + 1);
  const rows: AmenityValue[] = (list.data ?? []).map((r) => ({
    id: r.id,
    scope,
    key: r.key,
    label: r.label,
    icon: r.icon,
    verticals: r.verticals.map(parseVertical).filter((v): v is Vertical => !!v),
    sort: r.sort,
    active: r.active,
  }));
  const offeredTo = (a: AmenityValue) =>
    BUSINESS_VERTICALS.every((v) => a.verticals.includes(v))
      ? "tüm işletme türleri"
      : a.verticals
          .filter((v) => BUSINESS_VERTICALS.includes(v))
          .map((v) => VERTICAL_INFO[v].label)
          .join(", ") || "hiçbir tür";

  return (
    <>
      <FilterTabs
        ariaLabel="Olanak türü"
        items={SCOPES.map((s) => ({
          label: s === "oda" ? "Oda özellikleri" : "İşletme olanakları",
          active: (s === "oda") === room,
          href: routes.admin.vocabularies({ sekme: "olanaklar", kapsam: s === "oda" ? "oda" : undefined }),
        }))}
      />
      {list.error ? (
        <LoadError />
      ) : (
        <AdminCard
          title={room ? "Oda özellikleri" : "İşletme olanakları"}
          description={room ? "Otel odası eklerken seçilir, oda kartlarında görünür." : "İşletme sayfasını düzenlerken seçilir, işletme sayfasında görünür."}
          actions={
            <AmenityEditor
              scope={scope}
              trigger={
                <Button size="sm">
                  <Plus /> {room ? "Özellik ekle" : "Olanak ekle"}
                </Button>
              }
            />
          }
        >
          {rows.length ? (
            <ul className="divide-y">
              {rows.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <VocabIconView name={a.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{a.label}</span>
                      {a.active ? null : <Badge variant="secondary">Pasif</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {room ? "" : `${offeredTo(a)} · `}sıra {a.sort} · {formatNumber(used.get(a.key) ?? 0)} {room ? "odada" : "işletmede"} seçili
                    </span>
                  </span>
                  <AmenityEditor scope={scope} item={a} trigger={editButton(a.label)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          )}
        </AdminCard>
      )}
    </>
  );
}

async function EventCategoriesSection({ supabase }: { supabase: ServerSupabase }) {
  const [list, events] = await Promise.all([
    supabase.from("event_categories").select("id,key,label,icon,sort,active").order("sort").order("label"),
    supabase.from("events").select("category").limit(10000),
  ]);
  if (list.error) return <LoadError />;
  const used = new Map<string, number>();
  for (const e of events.data ?? []) used.set(e.category, (used.get(e.category) ?? 0) + 1);
  const rows: EventCategoryValue[] = (list.data ?? []).map((r) => ({ id: r.id, key: r.key, label: r.label, icon: r.icon, sort: r.sort, active: r.active }));

  return (
    <AdminCard
      title="Etkinlik kategorileri"
      description="Etkinlik eklerken seçilir; etkinlik kartında ve Etkinlikler sayfasındaki filtrede görünür. Kullanılan kategori silinmez, pasife alınır."
      actions={
        <EventCategoryEditor
          trigger={
            <Button size="sm">
              <Plus /> Kategori ekle
            </Button>
          }
        />
      }
    >
      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <VocabIconView name={c.icon} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{c.label}</span>
                {c.key === DEFAULT_EVENT_CATEGORY ? <Badge variant="outline">Varsayılan</Badge> : null}
                {c.active ? null : <Badge variant="secondary">Pasif</Badge>}
              </span>
              <span className="block text-xs text-muted-foreground">
                sıra {c.sort} · {formatNumber(used.get(c.key) ?? 0)} etkinlik
              </span>
            </span>
            <EventCategoryEditor item={c} trigger={editButton(c.label)} />
          </li>
        ))}
      </ul>
    </AdminCard>
  );
}
