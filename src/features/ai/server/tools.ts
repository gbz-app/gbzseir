import "server-only";
import { routes, type NearbyKind } from "@/core/routes";
import { formatDate, formatPhoneTR, formatPrice, formatTime, truncate } from "@/core/format";
import { describeDutyWindow, dutyDayFor, dutyWindowFor, isDutyActive } from "@/core/duty";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import { trNormalize } from "@/core/tr";
import { getDutyData, getPlaces } from "@/features/nearby/server/queries";
import { createPublicClient as createNearbyClient } from "@/features/nearby/server/public-client";
import { displayStopName, placeCategoryMeta, poiHref } from "@/features/nearby/config";
import type { PoiKind, PoiRow } from "@/features/nearby/types";
import { createPublicClient as createBusinessClient } from "@/features/business/lib/public-client";
import { describeOpenStatus, openStatusAt, parseWorkingHours, type OpenStatus } from "@/features/business/lib/hours";
import { BUSINESS_VERTICALS, LISTABLE_VERTICALS, VERTICAL_INFO, parseVertical, resolveVertical, type Vertical } from "@/features/business/lib/verticals";
import { listUpcomingEvents } from "@/features/events/queries";
import { listPublishedArticles } from "@/features/content/articles/queries";
import { getNews } from "@/features/content/news/get-news";
import type { AiCard, AiCardIcon } from "../lib/types";
import type { AgentTool as ApiTool } from "./agent";

/**
 * GebzemAI tools: app data only, through the same public (anon, RLS) queries the pages use. Each result is compact
 * JSON for the model (max 10 items, Turkish field names, app page paths) plus cards for the UI. Cards are built here
 * from the data, never from model text.
 */

const MAX_ITEMS = 10;

/** A sentence the answer must carry: the route appends `text` when the answer does not mention `keyword` (trNormalize'd). */
export type AiNotice = { text: string; keyword: string };

export type AiToolOutput = { content: string; cards: AiCard[]; isError?: boolean; notice?: AiNotice };

/** Duty answers in duty_data_mode 'demo' must always say the list is sample data (enforced by the route, not only the prompt). */
export const DEMO_DUTY_NOTICE: AiNotice = {
  text: "Not: Bu nöbet listesi örnek veridir, gerçek nöbet listesi değildir. Kesin bilgi için Kocaeli Eczacı Odası'na bakabilirsin.",
  keyword: "ornek",
};

// ---------------------------------------------------------------------------------------------------------------------------
// Input and text helpers
// ---------------------------------------------------------------------------------------------------------------------------
function str(v: unknown, max = 80): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
}

function int(v: unknown, min: number, max: number, d: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
}

const bool = (v: unknown): boolean => v === true || v === "true";

/** Drops null / undefined / "" fields so the JSON stays small. */
function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}

function result(data: Record<string, unknown>, cards: AiCard[]): AiToolOutput {
  return { content: JSON.stringify(compact(data)), cards: cards.slice(0, MAX_ITEMS) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Filler words that should not filter results ("açık kafe" -> "kafe"). */
const FILLER = new Set(["ve", "ile", "icin", "bir", "en", "yakin", "yakinda", "yakinimda", "gebze", "gebzede", "var", "mi", "mu", "neler", "nerede", "lazim", "iyi", "acik", "yer", "yerler", "yerleri", "hangi", "hangisi"]);

function tokens(q: string | undefined): string[] {
  return trNormalize(q)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !FILLER.has(t));
}

/** Every token is found; long tokens also match by their first ~70% (Turkish suffixes: "tesisatcisi" -> "tesisatc"). */
function matchesAll(hay: string, toks: string[]): boolean {
  const h = trNormalize(hay);
  return toks.every((t) => h.includes(t) || (t.length >= 6 && h.includes(t.slice(0, Math.ceil(t.length * 0.7)))));
}

const phoneText = (p: string | null | undefined): string | undefined => (p ? formatPhoneTR(p) || p : undefined);

type NbEmbed = { name: string } | Array<{ name: string }> | null | undefined;
const nbName = (n: NbEmbed): string | null => (Array.isArray(n) ? (n[0]?.name ?? null) : (n?.name ?? null));

// ---------------------------------------------------------------------------------------------------------------------------
// global_search (anon, RLS; same RPC as the search page)
// ---------------------------------------------------------------------------------------------------------------------------
type ServiceHit = { id: string; slug: string; name: string; parent_id: string | null; parent_name: string | null };
type PoiHit = { id: string; kind: PoiKind; slug: string; name: string; address: string | null; neighbourhood_name: string | null; category: string | null };

async function globalSearch(q: string, limit: number): Promise<{ businessIds: string[]; services: ServiceHit[]; pois: PoiHit[] }> {
  const { data, error } = await createNearbyClient(120, ["nearby", "search"]).rpc("global_search", { p_q: q, p_limit: limit }, { get: true });
  if (error) throw new Error(`global_search: ${error.code ?? "error"}`);
  const d = asRecord(data);
  return {
    businessIds: arr<{ id?: unknown }>(d.businesses)
      .map((b) => b.id)
      .filter(isId),
    services: arr<ServiceHit>(d.services).filter((s) => isId(s.id) && typeof s.slug === "string"),
    pois: arr<PoiHit>(d.pois).filter((p) => isId(p.id) && typeof p.slug === "string"),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1) nobetci_eczane
// ---------------------------------------------------------------------------------------------------------------------------
/** tarih: YYYY-MM-DD / "bugün" / "yarın" -> duty day key; null = right now. */
function parseDutyDay(v: string | undefined, now: Date): string | null {
  if (!v) return null;
  const n = trNormalize(v);
  const current = dutyDayFor(now);
  if (n === "bugun" || n === "simdi" || n === "bu gece") return null;
  if (n === "yarin") return addDaysToKey(current, 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) return null;
  // "Today" (calendar or duty day) means the list that is on duty right now.
  if (v === current || v === istanbulDateKey(now)) return null;
  return v;
}

async function nobetciEczane(input: Record<string, unknown>): Promise<AiToolOutput> {
  const duty = await getDutyData();
  const listCard: AiCard = { id: "page:duty", icon: "duty", title: "Nöbetçi eczaneler", subtitle: "Tüm liste ve harita", href: routes.nearby.dutyPharmacies() };
  if (duty.mode === "off") {
    return result(
      {
        durum: "liste_kapali",
        mesaj: "Nöbetçi eczane listesi şu an uygulamada gösterilmiyor. Güncel resmi liste Kocaeli Eczacı Odası'nda; Nöbetçi eczane sayfası oraya yönlendirir.",
        sayfa: routes.nearby.dutyPharmacies(),
      },
      [listCard],
    );
  }
  const now = new Date();
  const day = parseDutyDay(str(input.tarih, 20), now);
  let rows = duty.rows;
  let gun = "Şu an nöbette olanlar";
  if (day) {
    const w = dutyWindowFor(day);
    rows = rows.filter((r) => Date.parse(r.duty_start) < w.end.getTime() && Date.parse(r.duty_end) > w.start.getTime());
    gun = describeDutyWindow(w, now);
  } else {
    rows = rows.filter((r) => isDutyActive(r.duty_start, r.duty_end, now));
  }
  const demo = duty.mode === "demo";
  const list = rows.slice(0, MAX_ITEMS);
  const note = !duty.ok && !rows.length ? "Liste şu an alınamadı." : day && !rows.length ? "Bu gün için kayıt yok; yalnızca bugünün ve sonraki iki günün listesi var." : undefined;
  const data = {
    ornek_veri: demo,
    uyari: demo ? "ÖRNEK VERİ: Bu liste gerçek nöbet listesi değildir. Yanıtında bunu mutlaka söyle; kesin bilgi için Kocaeli Eczacı Odası." : undefined,
    gun,
    toplam: rows.length,
    eczaneler: list.map((r) =>
      compact({
        ad: r.name,
        mahalle: r.neighbourhood_name,
        adres: r.address,
        telefon: phoneText(r.phone),
        nobet: describeDutyWindow({ start: r.duty_start, end: r.duty_end }, now),
        sayfa: routes.nearby.pharmacy(r.slug),
      }),
    ),
    not: note,
    tum_liste: routes.nearby.dutyPharmacies(),
  };
  const cards: AiCard[] = list.map((r) => ({
    id: `duty:${r.duty_id}`,
    icon: "duty",
    title: r.name,
    subtitle: [r.neighbourhood_name, describeDutyWindow({ start: r.duty_start, end: r.duty_end }, now)].filter(Boolean).join(" · "),
    href: routes.nearby.pharmacy(r.slug),
    badge: demo ? "Örnek veri" : undefined,
    // Pharmacy numbers are real even when the duty list is a sample (same as the duty page).
    call: r.phone && isId(r.poi_id) ? { phone: r.phone, subjectType: "poi", subjectId: r.poi_id } : undefined,
  }));
  return { ...result(data, cards.length ? cards : [listCard]), notice: demo ? DEMO_DUTY_NOTICE : undefined };
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2) isletme_ara
// ---------------------------------------------------------------------------------------------------------------------------
const BIZ_COLUMNS =
  "id,slug,name,category_label,vertical,kinds,working_hours,vacation_mode,vacation_until,is_demo,phone,neighbourhoods!businesses_neighbourhood_id_fkey(name)";

type BizRow = {
  id: string;
  slug: string;
  name: string;
  category_label: string | null;
  vertical: string | null;
  kinds: string[] | null;
  working_hours: unknown;
  vacation_mode: boolean | null;
  vacation_until: string | null;
  is_demo: boolean | null;
  phone: string | null;
  neighbourhoods: NbEmbed;
};

const VERTICAL_ICON: Partial<Record<Vertical, AiCardIcon>> = {
  yemek: "food",
  restoran: "food",
  kafe: "cafe",
  otel: "hotel",
  hizmet: "service",
  magaza: "shop",
  saglik: "health",
};

function statusText(s: OpenStatus): string {
  if (!s.known) return "Çalışma saati girilmemiş";
  const d = describeOpenStatus(s);
  if (s.open) return d ? `Şu an açık (${d})` : "Şu an açık";
  if (s.vacation) return d ? `Tatilde (${d})` : "Tatilde";
  return d ? `Şu an kapalı (${d})` : "Şu an kapalı";
}

function serviceHref(s: ServiceHit): string {
  return s.parent_id ? routes.services.request(s.slug) : routes.services.category(s.slug);
}

async function isletmeAra(input: Record<string, unknown>): Promise<AiToolOutput> {
  const q = str(input.sorgu);
  const v = parseVertical(str(input.tur, 20));
  const vertical = v && v !== "etkinlik" ? v : null;
  const mahalle = trNormalize(str(input.mahalle, 60));
  const openNow = bool(input.simdi_acik);
  const client = createBusinessClient();

  let rows: BizRow[] = [];
  let services: ServiceHit[] = [];
  if (q) {
    const found = await globalSearch(q, 20);
    services = found.services.slice(0, 3);
    if (found.businessIds.length) {
      const { data, error } = await client.from("businesses").select(BIZ_COLUMNS).in("id", found.businessIds).eq("status", "approved");
      if (error) throw new Error(`businesses: ${error.code ?? "error"}`);
      const byId = new Map(((data ?? []) as unknown as BizRow[]).map((r) => [r.id, r]));
      rows = found.businessIds.map((id) => byId.get(id)).filter((r): r is BizRow => !!r);
    }
    if (vertical) rows = rows.filter((r) => resolveVertical(r.vertical, r.kinds) === vertical);
  }
  // No query, or nothing found within a type: the type's list (best rated first), filtered by the query words.
  if (!rows.length && (vertical || !q)) {
    let query = client.from("businesses").select(BIZ_COLUMNS).eq("status", "approved");
    if (vertical) query = query.eq("vertical", vertical);
    // nullsFirst false: unrated businesses after rated ones (Postgres puts NULLs first in DESC).
    const { data, error } = await query.order("rating_avg", { ascending: false, nullsFirst: false }).order("name").limit(300);
    if (error) throw new Error(`businesses: ${error.code ?? "error"}`);
    rows = (data ?? []) as unknown as BizRow[];
    const toks = tokens(q);
    if (toks.length) rows = rows.filter((r) => matchesAll(`${r.name} ${r.category_label ?? ""}`, toks));
  }

  const now = new Date();
  let list = rows.map((r) => ({
    r,
    nb: nbName(r.neighbourhoods),
    vertical: resolveVertical(r.vertical, r.kinds),
    status: openStatusAt(parseWorkingHours(r.working_hours), now, { vacation_mode: r.vacation_mode, vacation_until: r.vacation_until }),
  }));
  // Real businesses before sample (demo) records; otherwise the order is kept (sort is stable).
  list.sort((a, b) => Number(a.r.is_demo === true) - Number(b.r.is_demo === true));
  if (mahalle) list = list.filter((x) => trNormalize(x.nb).includes(mahalle));
  const beforeOpen = list.length;
  if (openNow) list = list.filter((x) => x.status.known && x.status.open);
  const top = list.slice(0, MAX_ITEMS);

  const moreHref = vertical && LISTABLE_VERTICALS.includes(vertical) ? routes.businesses.vertical(vertical) : q ? routes.search(q) : routes.businesses.root();
  const note = !top.length
    ? openNow && beforeOpen
      ? "Şu an açık olan bulunamadı (çalışma saati girilmemiş işletmeler dahil değil)."
      : "Uygun işletme bulunamadı."
    : undefined;

  const data = {
    isletmeler: top.map(({ r, nb, vertical: vt, status }) =>
      compact({
        ad: r.name,
        tur: r.category_label || VERTICAL_INFO[vt].label,
        mahalle: nb,
        durum: statusText(status),
        ornek: r.is_demo ? "Örnek kayıt (gerçek işletme değil)" : undefined,
        telefon: r.is_demo ? undefined : phoneText(r.phone),
        sayfa: routes.businesses.detail(r.slug),
      }),
    ),
    hizmet_kategorileri: services.length
      ? services.map((s) => compact({ ad: s.name, ust_kategori: s.parent_name, not: "Ücretsiz hizmet talebi oluşturulabilir.", sayfa: serviceHref(s) }))
      : undefined,
    toplam: list.length,
    not: note,
    tumu: moreHref,
  };

  const cards: AiCard[] = top.map(({ r, nb, vertical: vt, status }) => ({
    id: `business:${r.id}`,
    icon: VERTICAL_ICON[vt] ?? "business",
    title: r.name,
    subtitle: [r.category_label || VERTICAL_INFO[vt].label, nb, status.known ? (status.open ? "Açık" : status.vacation ? "Tatilde" : "Kapalı") : null].filter(Boolean).join(" · "),
    href: routes.businesses.detail(r.slug),
    badge: r.is_demo ? "Örnek" : undefined,
    call: r.phone && !r.is_demo ? { phone: r.phone, subjectType: "business", subjectId: r.id } : undefined,
  }));
  for (const s of services) {
    cards.push({
      id: `service:${s.id}`,
      icon: "service",
      title: s.name,
      subtitle: s.parent_id ? "Ücretsiz hizmet talebi oluştur" : "Hizmet kategorisi",
      href: serviceHref(s),
    });
  }
  if (!cards.length) cards.push({ id: `page:${moreHref}`, icon: vertical ? (VERTICAL_ICON[vertical] ?? "business") : "business", title: "Tümüne göz at", subtitle: "Uygulamadaki liste", href: moreHref });
  return result(data, cards);
}

// ---------------------------------------------------------------------------------------------------------------------------
// 3) yer_ara
// ---------------------------------------------------------------------------------------------------------------------------
const KIND_BY_TUR: Record<string, PoiKind> = {
  eczane: "pharmacy",
  cami: "mosque",
  durak: "bus_stop",
  taksi: "taxi",
  atm: "atm",
  gezilecek: "place",
  banka: "bank",
  akaryakit: "fuel",
  sarj: "ev_charge",
  kurum: "institution",
};
// Partial: new poi kinds may arrive before this file knows them (they then use the generic label / icon).
const TUR_BY_KIND: Partial<Record<PoiKind, NearbyKind>> = {
  pharmacy: "eczane",
  mosque: "cami",
  bus_stop: "durak",
  taxi: "taksi",
  atm: "atm",
  place: "gezilecek",
  bank: "banka",
  fuel: "akaryakit",
  ev_charge: "sarj",
  institution: "kurum",
};
const KIND_LABEL: Partial<Record<PoiKind, string>> = {
  pharmacy: "Eczane",
  mosque: "Cami",
  bus_stop: "Durak",
  taxi: "Taksi durağı",
  atm: "ATM",
  place: "Gezilecek yer",
  bank: "Banka",
  fuel: "Akaryakıt istasyonu",
  ev_charge: "Şarj istasyonu",
  institution: "Kurum",
};
const KIND_ICON: Partial<Record<PoiKind, AiCardIcon>> = {
  pharmacy: "pharmacy",
  mosque: "mosque",
  bus_stop: "bus_stop",
  taxi: "taxi",
  atm: "atm",
  place: "place",
  bank: "atm",
  fuel: "fuel",
  ev_charge: "ev_charge",
  institution: "institution",
};
const kindLabel = (k: PoiKind): string => KIND_LABEL[k] ?? "Yer";
const kindIcon = (k: PoiKind): AiCardIcon => KIND_ICON[k] ?? "place";

/** Words that mean "places to visit", mapped to a place category when they name one. */
const PLACE_WORDS: Array<[RegExp, string | null]> = [
  [/\b(tarihi?|kale|antik|kulliye|tarih)\w*/, "tarihi"],
  [/\bmuze\w*/, "muze"],
  [/\b(park|piknik|mesire)\w*/, "park"],
  [/\b(doga|orman|sahil|gol|yuruyus)\w*/, "doga"],
  [/\b(avm|alisveris)\w*/, "avm"],
  [/\b(gezilecek|gorulecek|turistik|gezi)\w*/, null],
];
const PLACE_GENERIC = /^(gezilecek|gorulecek|turistik|gezi|tarihi?|tarih|muze\w*|park\w*|doga|avm|alisveris|yerler?i?|neler)$/;

async function places(q: string | undefined): Promise<AiToolOutput> {
  const all = await getPlaces();
  const qn = trNormalize(q);
  const category = PLACE_WORDS.find(([re]) => re.test(qn))?.[1] ?? null;
  const toks = tokens(q).filter((t) => !PLACE_GENERIC.test(t));
  let list = all;
  if (category) list = list.filter((p) => p.details.category === category);
  if (toks.length) list = list.filter((p) => matchesAll(`${p.name} ${p.details.description ?? ""}`, toks));
  const top = list.slice(0, MAX_ITEMS);
  const data = {
    yerler: top.map((p) =>
      compact({
        ad: p.name,
        kategori: placeCategoryMeta(p.details.category).label,
        mahalle: p.neighbourhoodName,
        aciklama: p.details.description ? truncate(p.details.description, 160) : undefined,
        saatler: p.details.hours,
        ucret: p.details.fee,
        sayfa: routes.nearby.place(p.slug),
      }),
    ),
    toplam: list.length,
    not: top.length ? undefined : "Uygun yer bulunamadı.",
    tumu: routes.nearby.places(),
  };
  const cards: AiCard[] = top.map((p) => ({
    id: `place:${p.id}`,
    icon: "place",
    title: p.name,
    subtitle: [placeCategoryMeta(p.details.category).label, p.neighbourhoodName].filter(Boolean).join(" · "),
    href: routes.nearby.place(p.slug),
  }));
  return result(data, cards.length ? cards : [{ id: "page:places", icon: "place", title: "Gezilecek yerler", subtitle: "Tüm liste", href: routes.nearby.places() }]);
}

async function poiPhones(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await createNearbyClient(3600, ["nearby", "poi"]).from("poi").select("id,phone").in("id", ids);
  if (error) return new Map();
  return new Map((data ?? []).filter((r) => r.phone).map((r) => [r.id, r.phone as string]));
}

function poiName(kind: PoiKind, name: string, nb: string | null): string {
  return kind === "bus_stop" ? displayStopName(name, nb) : name;
}

async function yerAra(input: Record<string, unknown>): Promise<AiToolOutput> {
  const q = str(input.sorgu);
  const turRaw = trNormalize(str(input.tur, 20));
  // Own keys only: the model's "tur" must not reach Object.prototype ("constructor").
  const kind: PoiKind | undefined = Object.prototype.hasOwnProperty.call(KIND_BY_TUR, turRaw) ? KIND_BY_TUR[turRaw] : undefined;
  if (kind === "place" || (!kind && q && PLACE_WORDS.some(([re]) => re.test(trNormalize(q))))) return places(q);
  if (!q && !kind) return { content: JSON.stringify({ hata: "sorgu ya da tur gerekli" }), cards: [], isError: true };

  const mapHref = kind ? routes.nearby.root(TUR_BY_KIND[kind]) : routes.nearby.root();
  type Item = { id: string; kind: PoiKind; slug: string; name: string; address: string | null; nb: string | null; phone: string | null };
  let items: Item[];
  if (q) {
    const found = await globalSearch(q, 20);
    const pois = found.pois.filter((p) => !kind || p.kind === kind).slice(0, MAX_ITEMS);
    const phones = await poiPhones(pois.map((p) => p.id));
    items = pois.map((p) => ({ id: p.id, kind: p.kind, slug: p.slug, name: p.name, address: p.address, nb: p.neighbourhood_name, phone: phones.get(p.id) ?? null }));
  } else {
    const { data, error } = await createNearbyClient(3600, ["nearby", "poi"]).rpc("nearby_pois", { p_kind: kind, p_limit: MAX_ITEMS }, { get: true });
    if (error) throw new Error(`nearby_pois: ${error.code ?? "error"}`);
    items = ((data ?? []) as PoiRow[]).map((p) => ({ id: p.id, kind: p.kind, slug: p.slug, name: p.name, address: p.address, nb: p.neighbourhood_name, phone: p.phone }));
  }

  const data = {
    yerler: items.map((p) =>
      compact({ ad: poiName(p.kind, p.name, p.nb), tur: kindLabel(p.kind), mahalle: p.nb, adres: p.address, telefon: phoneText(p.phone), sayfa: poiHref(p.kind, p.slug) }),
    ),
    not: items.length ? (q ? undefined : "Konum bilinmediği için ada göre ilk kayıtlar; yakındakiler için Keşfet haritası.") : "Uygun yer bulunamadı.",
    harita: mapHref,
  };
  const cards: AiCard[] = items.map((p) => ({
    id: `poi:${p.id}`,
    icon: kindIcon(p.kind),
    title: poiName(p.kind, p.name, p.nb),
    subtitle: [kindLabel(p.kind), p.nb ?? p.address].filter(Boolean).join(" · "),
    href: poiHref(p.kind, p.slug),
    call: p.phone ? { phone: p.phone, subjectType: "poi", subjectId: p.id } : undefined,
  }));
  return result(data, cards.length ? cards : [{ id: `page:${mapHref}`, icon: kind ? kindIcon(kind) : "place", title: "Keşfet haritası", subtitle: "Yakınındaki yerler", href: mapHref }]);
}

// ---------------------------------------------------------------------------------------------------------------------------
// 4) etkinlikler
// ---------------------------------------------------------------------------------------------------------------------------
async function etkinlikler(input: Record<string, unknown>): Promise<AiToolOutput> {
  const days = int(input.gun_sayisi, 1, 60, 7);
  const until = Date.now() + days * 86_400_000;
  const all = await listUpcomingEvents(200);
  const list = all.filter((e) => Date.parse(e.starts_at) <= until);
  const top = list.slice(0, MAX_ITEMS);
  const when = (iso: string) => `${formatDate(iso, { month: "long", weekday: true })} ${formatTime(iso)}`;
  const price = (e: (typeof all)[number]) => (e.is_free ? "Ücretsiz" : e.price_try !== null ? formatPrice(e.price_try) : (e.price_note ?? undefined));
  const data = {
    donem: `Önümüzdeki ${days} gün`,
    etkinlikler: top.map((e) =>
      compact({
        baslik: e.title,
        kategori: e.category_label,
        zaman: when(e.starts_at),
        bitis: e.ends_at ? when(e.ends_at) : undefined,
        mekan: e.venue_name,
        mahalle: e.neighbourhood_name,
        ucret: price(e),
        duzenleyen: e.business?.name,
        ornek: e.is_demo ? "Örnek etkinlik (gerçek değil)" : undefined,
        sayfa: routes.events.detail(e.slug),
      }),
    ),
    toplam: list.length,
    not: top.length ? undefined : "Bu dönemde yayında etkinlik yok.",
    tumu: routes.events.root(),
  };
  const cards: AiCard[] = top.map((e) => {
    const phone = e.phone ?? e.business?.phone ?? null;
    const sample = e.is_demo || e.business?.is_demo === true;
    return {
      id: `event:${e.id}`,
      icon: "event",
      title: e.title,
      subtitle: [when(e.starts_at), e.venue_name].filter(Boolean).join(" · "),
      href: routes.events.detail(e.slug),
      badge: e.is_demo ? "Örnek" : undefined,
      call: phone && !sample ? { phone, subjectType: "event", subjectId: e.id } : undefined,
    };
  });
  return result(data, cards.length ? cards : [{ id: "page:events", icon: "event", title: "Etkinlikler", subtitle: "Tüm etkinlikler", href: routes.events.root() }]);
}

// ---------------------------------------------------------------------------------------------------------------------------
// 5) taksi_duraklari
// ---------------------------------------------------------------------------------------------------------------------------
async function taksiDuraklari(input: Record<string, unknown>): Promise<AiToolOutput> {
  const mahalle = trNormalize(str(input.mahalle, 60));
  const { data, error } = await createNearbyClient(3600, ["nearby", "poi"]).rpc("nearby_pois", { p_kind: "taxi", p_limit: 300 }, { get: true });
  if (error) throw new Error(`nearby_pois: ${error.code ?? "error"}`);
  const all = (data ?? []) as PoiRow[];
  const inArea = mahalle ? all.filter((p) => trNormalize(`${p.neighbourhood_name ?? ""} ${p.address ?? ""} ${p.name}`).includes(mahalle)) : all;
  const list = inArea.length ? inArea : all;
  // Stands with a phone number first.
  const top = [...list].sort((a, b) => Number(!!b.phone) - Number(!!a.phone)).slice(0, MAX_ITEMS);
  const mapHref = routes.nearby.root("taksi");
  const payload = {
    duraklar: top.map((p) => compact({ ad: p.name, mahalle: p.neighbourhood_name, adres: p.address, telefon: phoneText(p.phone), sayfa: mapHref })),
    toplam: list.length,
    not: mahalle && !inArea.length && all.length ? "Bu mahallede kayıtlı durak yok; Gebze genelindeki duraklar listelendi." : all.length ? undefined : "Kayıtlı taksi durağı yok.",
    harita: mapHref,
  };
  const cards: AiCard[] = top.map((p) => ({
    id: `poi:${p.id}`,
    icon: "taxi",
    title: p.name,
    subtitle: [p.neighbourhood_name, p.address].filter(Boolean).join(" · ") || "Taksi durağı",
    href: mapHref,
    call: p.phone ? { phone: p.phone, subjectType: "poi", subjectId: p.id } : undefined,
  }));
  return result(payload, cards.length ? cards : [{ id: "page:taxi", icon: "taxi", title: "Taksi durakları", subtitle: "Keşfet haritası", href: mapHref }]);
}

// ---------------------------------------------------------------------------------------------------------------------------
// 6) son_haberler
// ---------------------------------------------------------------------------------------------------------------------------
async function sonHaberler(input: Record<string, unknown>): Promise<AiToolOutput> {
  const n = int(input.adet, 1, MAX_ITEMS, 5);
  const [articles, news] = await Promise.all([listPublishedArticles(n).catch(() => []), getNews().catch(() => null)]);
  const feed = news?.items ?? [];
  const local = feed.filter((i) => i.local);
  const headlines = (local.length ? local : feed).slice(0, Math.max(0, n - articles.length));
  const data = {
    haberler: [
      ...articles.map((a) =>
        compact({
          baslik: a.title,
          ozet: a.summary ? truncate(a.summary, 140) : undefined,
          kaynak: "Gebzem",
          tarih: formatDate(a.publishedAt, { month: "long" }),
          sayfa: routes.content.newsArticle(a.slug),
        }),
      ),
      ...headlines.map((h) =>
        compact({
          baslik: h.title,
          ozet: h.summary ? truncate(h.summary, 140) : undefined,
          kaynak: h.sourceName,
          tarih: h.publishedAt ? formatDate(h.publishedAt, { month: "long" }) : undefined,
          sayfa: routes.content.news(),
        }),
      ),
    ],
    not: articles.length || headlines.length ? undefined : "Şu an haber alınamadı.",
    tumu: routes.content.news(),
  };
  const cards: AiCard[] = [
    ...articles.map<AiCard>((a) => ({
      id: `article:${a.id}`,
      icon: "news",
      title: a.title,
      subtitle: `Gebzem · ${formatDate(a.publishedAt)}`,
      href: routes.content.newsArticle(a.slug),
    })),
    ...headlines.map<AiCard>((h) => {
      // Headlines open the source site (https only); anything else opens our news page.
      const external = /^https:\/\//i.test(h.url);
      return {
        id: `news:${h.id}`,
        icon: "news",
        title: h.title,
        subtitle: [h.sourceName, h.publishedAt ? formatDate(h.publishedAt) : null].filter(Boolean).join(" · "),
        href: external ? h.url : routes.content.news(),
        external: external || undefined,
      };
    }),
  ];
  return result(data, cards.length ? cards : [{ id: "page:news", icon: "news", title: "Haberler", subtitle: "Gebze gündemi", href: routes.content.news() }]);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------------------------------------------------------
export const AI_TOOLS: ApiTool[] = [
  {
    name: "nobetci_eczane",
    description:
      "Gebze'deki nöbetçi eczaneleri uygulamanın nöbet listesinden verir: ad, mahalle, adres, telefon, nöbet saati. Tarih verilmezse şu an nöbette olanlar gelir. Nöbet günü 08:30'da değişir. Sonuçta ornek_veri true ise liste örnek veridir ve bunu kullanıcıya söylemelisin.",
    input_schema: {
      type: "object",
      properties: { tarih: { type: "string", description: "İstenen gün (YYYY-MM-DD). Bugün ya da şu an için boş bırak." } },
      additionalProperties: false,
    },
  },
  {
    name: "isletme_ara",
    description:
      "Uygulamadaki onaylı işletmeleri arar: restoran, kafe, otel, usta ve hizmet firmaları, sağlık, mağaza... Şu an açık / kapalı / tatilde durumunu, telefonu ve sayfasını verir. Usta ya da hizmet arayanlar için ücretsiz talep oluşturulabilecek hizmet kategorilerini de döndürür.",
    input_schema: {
      type: "object",
      properties: {
        sorgu: { type: "string", description: "Aranan şey: işletme adı ya da ne arandığı (ör. 'tesisatçı', 'kahvaltı', 'döner'). Türü zaten 'tur' ile verdiysen boş bırakabilirsin." },
        tur: { type: "string", enum: [...BUSINESS_VERTICALS], description: "İşletme türü." },
        mahalle: { type: "string", description: "Mahalle adı (ör. 'Hacı Halil')." },
        simdi_acik: { type: "boolean", description: "true: yalnızca şu an açık olanlar." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "yer_ara",
    description:
      "Gebze'deki yerleri arar: eczane, cami, otobüs durağı, taksi durağı, ATM, banka, akaryakıt ve şarj istasyonu, kurumlar ve gezilecek yerler (tarihi yerler, parklar, müzeler, doğa, AVM). Adres, telefon ve sayfa verir.",
    input_schema: {
      type: "object",
      properties: {
        sorgu: { type: "string", description: "Yer adı ya da aranan şey (ör. 'Çoban Mustafa Paşa', 'tarihi yerler', 'park')." },
        tur: {
          type: "string",
          enum: ["eczane", "cami", "durak", "taksi", "atm", "banka", "akaryakit", "sarj", "kurum", "gezilecek"],
          description: "Yer türü.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "etkinlikler",
    description: "Gebze'de yayındaki yaklaşan etkinlikleri verir: başlık, tarih ve saat, mekan, ücret, sayfa.",
    input_schema: {
      type: "object",
      properties: { gun_sayisi: { type: "integer", minimum: 1, maximum: 60, description: "Kaç gün ileriye bakılsın (varsayılan 7)." } },
      additionalProperties: false,
    },
  },
  {
    name: "taksi_duraklari",
    description: "Gebze'deki taksi duraklarını telefon numaralarıyla verir. Mahalle verilirse o mahalledekiler önce gelir.",
    input_schema: {
      type: "object",
      properties: { mahalle: { type: "string", description: "Mahalle adı (isteğe bağlı)." } },
      additionalProperties: false,
    },
  },
  {
    name: "son_haberler",
    description: "Gebze'den son haberleri verir: uygulamanın kendi haberleri ve yerel haber sitelerinin başlıkları.",
    input_schema: {
      type: "object",
      properties: { adet: { type: "integer", minimum: 1, maximum: 10, description: "Kaç haber (varsayılan 5)." } },
      additionalProperties: false,
    },
  },
];

const RUNNERS: Record<string, (input: Record<string, unknown>) => Promise<AiToolOutput>> = {
  nobetci_eczane: nobetciEczane,
  isletme_ara: isletmeAra,
  yer_ara: yerAra,
  etkinlikler,
  taksi_duraklari: taksiDuraklari,
  son_haberler: sonHaberler,
};

const STATUS_LABELS: Record<string, string> = {
  nobetci_eczane: "Nöbetçi eczanelere bakıyorum",
  isletme_ara: "İşletmelere bakıyorum",
  yer_ara: "Yerlere bakıyorum",
  etkinlikler: "Etkinliklere bakıyorum",
  taksi_duraklari: "Taksi duraklarına bakıyorum",
  son_haberler: "Haberlere bakıyorum",
};

export function toolStatusLabel(name: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, name) ? STATUS_LABELS[name] : "Bakıyorum";
}

/** Runs a tool; unknown tools and failures become an is_error result (logged without any user text). */
export async function runAiTool(name: string, input: Record<string, unknown>): Promise<AiToolOutput> {
  const run = Object.prototype.hasOwnProperty.call(RUNNERS, name) ? RUNNERS[name] : undefined;
  if (!run) return { content: JSON.stringify({ hata: "Bilinmeyen araç." }), cards: [], isError: true };
  try {
    return await run(input && typeof input === "object" ? input : {});
  } catch (e) {
    console.error("[gebzemai] tool failed", name, e instanceof Error ? e.message.slice(0, 120) : typeof e);
    return { content: JSON.stringify({ hata: "Bu bilgiye şu an ulaşılamadı. Kullanıcıya ilgili uygulama sayfasını öner." }), cards: [], isError: true };
  }
}
