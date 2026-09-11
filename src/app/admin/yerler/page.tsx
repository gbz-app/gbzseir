import type { Metadata } from "next";
import { ExternalLink, MapPinned, Pencil, Plus, Star, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { parsePlaceDetails } from "@/features/nearby/lib/details";
import { AdminThumb, EmptyCard, FilterTabs, SearchBox } from "@/features/admin/components/admin-ui";
import { PlaceDialog, type PlaceValue } from "@/features/admin/components/place-dialog";
import { PLACE_CATEGORIES, POI_SOURCES } from "@/features/admin/lib/labels";
import { oneOf, searchTerm } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Yerler" };

const TABS = ["tumu", "one-cikan", "fotografsiz"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { tumu: "Tümü", "one-cikan": "Öne çıkan", fotografsiz: "Fotoğrafsız" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Gezilecek yerler: açıklama, fotoğraf, kategori, öne çıkarma ve yeni yer ekleme. */
export default async function AdminPlacesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = oneOf<Tab>(sp.sekme, TABS, "tumu");
  const q = searchTerm(sp.q);
  const supabase = await createClient();
  let query = supabase.from("poi").select("id,name,slug,address,lat,lng,details,source,updated_at").eq("kind", "place").order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query.limit(500);

  const all = (data ?? []).map((p) => {
    const d = parsePlaceDetails(p.details);
    const value: PlaceValue = {
      id: p.id,
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      category: d.category,
      description: d.description,
      hours: d.hours,
      fee: d.fee,
      curated: d.curated,
      photos: d.photos,
    };
    return { ...value, slug: p.slug, source: p.source, updated_at: p.updated_at };
  });
  const rows = all.filter((p) => (tab === "one-cikan" ? p.curated : tab === "fotografsiz" ? p.photos.length === 0 : true));

  return (
    <>
      <AdminPageHeader
        title="Gezilecek yerler"
        description={`${all.length} yer · ${all.filter((p) => p.curated).length} öne çıkan · ${all.filter((p) => !p.photos.length).length} fotoğrafsız`}
        actions={
          <PlaceDialog
            trigger={
              <Button>
                <Plus /> Yeni yer
              </Button>
            }
          />
        }
      />
      <div className="flex flex-col gap-3">
        <FilterTabs ariaLabel="Yer filtresi" items={TABS.map((t) => ({ label: TAB_LABELS[t], active: t === tab, href: withQuery(routes.admin.places(), { sekme: t === "tumu" ? undefined : t, q }) }))} />
        <SearchBox action={routes.admin.places()} defaultValue={q} placeholder="Yer adında ara" label="Yer ara" hidden={{ sekme: tab === "tumu" ? undefined : tab }} />
      </div>
      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Yerler yüklenemedi" />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={MapPinned} title="Bu filtrede yer yok" />
          </EmptyCard>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <AdminThumb src={p.photos[0]?.url} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {p.name}
                    {p.curated ? (
                      <Badge variant="warning" className="gap-1">
                        <Star className="size-3" aria-hidden /> Öne çıkan
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PLACE_CATEGORIES[p.category] ?? p.category} · {p.photos.length} fotoğraf · {POI_SOURCES[p.source] ?? p.source} · {formatRelativeTime(p.updated_at)}
                  </p>
                </div>
                <a
                  href={publicUrl(routes.nearby.place(p.slug))}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p.name} sayfasını aç`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
                <PlaceDialog
                  value={p}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`${p.name} düzenle`}>
                      <Pencil />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
