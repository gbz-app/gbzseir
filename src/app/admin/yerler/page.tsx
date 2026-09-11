import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, EyeOff, Lock, MapPinned, Pencil, Plus, Star, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPhoneTR, formatRelativeTime } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { publicUrl } from "@/config/app-mode";
import { DEFAULT_VOCABULARIES, loadVocabularies } from "@/features/business/lib/vocabularies";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { parsePlaceDetails } from "@/features/nearby/lib/details";
import type { PoiKind } from "@/features/nearby/types";
import { AdminThumb, EmptyCard, FilterTabs, SearchBox } from "@/features/admin/components/admin-ui";
import { PlaceDialog, type PlaceValue } from "@/features/admin/components/place-dialog";
import { POI_SOURCES } from "@/features/admin/lib/labels";
import { POI_KIND_META, POI_KIND_VALUES, poiKindFromParam, poiKindParam, poiPublicPath } from "@/features/admin/lib/poi-kinds";
import { one, oneOf, searchTerm } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Yerler" };

const PLACE_TABS = ["tumu", "one-cikan", "fotografsiz", "gizli"] as const;
const POI_TABS = ["tumu", "telefonsuz", "adressiz", "gizli"] as const;
type Tab = (typeof PLACE_TABS)[number] | (typeof POI_TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  tumu: "Tümü",
  "one-cikan": "Öne çıkan",
  fotografsiz: "Fotoğrafsız",
  telefonsuz: "Telefonsuz",
  adressiz: "Adressiz",
  gizli: "Gizli",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOW_MAX = 300;

type Item = PlaceValue & { slug: string; updated_at: string };

function matchesTab(tab: Tab, p: Item): boolean {
  switch (tab) {
    case "one-cikan":
      return p.curated;
    case "fotografsiz":
      return p.photos.length === 0;
    case "telefonsuz":
      return !p.phone;
    case "adressiz":
      return !p.address;
    case "gizli":
      return p.hidden;
    default:
      return true;
  }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Yerler: every poi kind (gezilecek yer, eczane, cami, durak, taksi, ATM). Name, phone, address, location and hiding;
 * gezilecek yerler also get texts, photos, category and the featured flag. ?yer= (slug / uuid) opens one editor.
 */
export default async function AdminPlacesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = poiKindFromParam(one(sp.tur));
  const kindParam = poiKindParam(kind);
  const meta = POI_KIND_META[kind];
  const isPlace = kind === "place";
  const tab = oneOf<Tab>(sp.sekme, isPlace ? PLACE_TABS : POI_TABS, "tumu");
  const q = searchTerm(sp.q);
  const ref = one(sp.yer)?.toLowerCase().slice(0, 200);
  const supabase = await createClient();

  let query = supabase
    .from("poi")
    .select("id,kind,name,slug,address,phone,lat,lng,details,source,updated_at,hidden,locked")
    .eq("kind", kind)
    .order("name");
  if (ref) query = UUID_RE.test(ref) ? query.eq("id", ref) : query.eq("slug", ref);
  else if (q) query = query.ilike("name", `%${q}%`);
  const [{ data, error }, vocab, ...kindCounts] = await Promise.all([
    query.limit(2000),
    // Fresh read (the admin site's own cache is not expired by revalidatePublic): admin-added categories show at once.
    loadVocabularies(supabase).catch(() => DEFAULT_VOCABULARIES),
    ...POI_KIND_VALUES.map((k) => supabase.from("poi").select("id", { count: "exact", head: true }).eq("kind", k)),
  ]);
  const categories = vocab.placeCategories;
  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;

  const all: Item[] = (data ?? []).map((p) => {
    const d = parsePlaceDetails(p.details);
    return {
      id: p.id,
      kind: p.kind as PoiKind,
      name: p.name,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      hidden: p.hidden,
      locked: p.locked,
      source: p.source,
      category: d.category,
      description: d.description,
      hours: d.hours,
      fee: d.fee,
      curated: d.curated,
      photos: d.photos,
      slug: p.slug,
      updated_at: p.updated_at,
    };
  });
  const rows = ref ? all : all.filter((p) => matchesTab(tab, p));
  const shown = rows.slice(0, SHOW_MAX);
  const hiddenCount = all.filter((p) => p.hidden).length;
  const summary = isPlace
    ? `${all.length} yer · ${all.filter((p) => p.curated).length} öne çıkan · ${all.filter((p) => !p.photos.length).length} fotoğrafsız · ${hiddenCount} gizli`
    : `${all.length} kayıt · ${all.filter((p) => !p.phone).length} telefonsuz · ${all.filter((p) => !p.address).length} adressiz · ${hiddenCount} gizli`;

  return (
    <>
      <AdminPageHeader
        title="Yerler"
        description={`${meta.plural}: ${summary}. Düzenlediğin yer kilitlenir; veri eşitlemesi senin değişikliklerini ezmez.`}
        actions={
          <PlaceDialog
            key={kind}
            kind={kind}
            categories={categories}
            trigger={
              <Button>
                <Plus /> Yeni yer
              </Button>
            }
          />
        }
      />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Yer türü"
          items={POI_KIND_VALUES.map((k, i) => ({
            label: POI_KIND_META[k].plural,
            count: kindCounts[i]?.count ?? null,
            active: k === kind,
            href: withQuery(routes.admin.places(), { tur: poiKindParam(k) }),
          }))}
        />
        <FilterTabs
          ariaLabel="Yer filtresi"
          items={(isPlace ? PLACE_TABS : POI_TABS).map((t) => ({
            label: TAB_LABELS[t],
            active: !ref && t === tab,
            href: withQuery(routes.admin.places(), { tur: kindParam, sekme: t === "tumu" ? undefined : t, q }),
          }))}
        />
        <SearchBox
          action={routes.admin.places()}
          defaultValue={q}
          placeholder="Yer adında ara"
          label="Yer ara"
          hidden={{ tur: kindParam, sekme: tab === "tumu" ? undefined : tab }}
        />
        {ref ? (
          <p className="text-sm text-muted-foreground">
            Destek mesajındaki yer gösteriliyor.{" "}
            <Link href={withQuery(routes.admin.places(), { tur: kindParam })} className="font-semibold text-primary hover:underline">
              Tümünü göster
            </Link>
          </p>
        ) : null}
      </div>
      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Yerler yüklenemedi" />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={MapPinned} title={ref ? "Bu yer bulunamadı" : "Bu filtrede yer yok"} />
          </EmptyCard>
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
              {shown.map((p) => {
                const publicPath = p.hidden ? null : poiPublicPath(kind, p.slug);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    {isPlace ? <AdminThumb src={p.photos[0]?.url} size={56} /> : <KindIcon kind={kind} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {p.name}
                        {isPlace && p.curated ? (
                          <Badge variant="warning" className="gap-1">
                            <Star className="size-3" aria-hidden /> Öne çıkan
                          </Badge>
                        ) : null}
                        {p.hidden ? (
                          <Badge variant="outline" className="gap-1">
                            <EyeOff className="size-3" aria-hidden /> Gizli
                          </Badge>
                        ) : null}
                        {p.locked && (p.source === "osm" || p.source === "kbb") ? (
                          <Badge variant="secondary" className="gap-1">
                            <Lock className="size-3" aria-hidden /> Kilitli
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-xs break-words text-muted-foreground">
                        {isPlace
                          ? `${categoryLabel(p.category)} · ${p.photos.length} fotoğraf`
                          : `${p.phone ? formatPhoneTR(p.phone) : "Telefon yok"} · ${p.address ?? "Adres yok"}`}{" "}
                        · {POI_SOURCES[p.source] ?? p.source} · {formatRelativeTime(p.updated_at)}
                      </p>
                    </div>
                    {publicPath ? (
                      <a
                        href={publicUrl(publicPath)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${p.name} sayfasını aç`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    ) : null}
                    <PlaceDialog
                      kind={kind}
                      value={p}
                      categories={categories}
                      defaultOpen={!!ref && rows.length === 1}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`${p.name} düzenle`}>
                          <Pencil />
                        </Button>
                      }
                    />
                  </li>
                );
              })}
            </ul>
            {rows.length > shown.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {rows.length} kaydın ilk {shown.length} tanesi gösteriliyor; aradığını adıyla ara.
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
