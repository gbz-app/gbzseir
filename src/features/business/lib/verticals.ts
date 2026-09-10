/**
 * Business verticals (işletme türü) and the vocabularies that depend on them: amenities, room features,
 * menu tags, price levels and event categories. Pure TS + lucide icons (server and client safe).
 */
import {
  Accessibility,
  AirVent,
  Baby,
  Bath,
  BedDouble,
  BellRing,
  Brush,
  Building2,
  Bus,
  CalendarCheck,
  Car,
  ChefHat,
  Coffee,
  ConciergeBell,
  CreditCard,
  Croissant,
  DoorOpen,
  Drama,
  Dumbbell,
  Flame,
  Laptop,
  Leaf,
  LockKeyhole,
  Mic,
  Music,
  Palette,
  PartyPopper,
  PawPrint,
  Presentation,
  Refrigerator,
  ShoppingBag,
  Sparkles,
  Store,
  Sunset,
  Ticket,
  Trees,
  Trophy,
  Tv,
  UtensilsCrossed,
  Vegan,
  Waves,
  WheatOff,
  Wifi,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const VERTICALS = ["yemek", "restoran", "kafe", "otel", "hizmet", "magaza", "etkinlik", "diger"] as const;
export type Vertical = (typeof VERTICALS)[number];

export type VerticalInfo = {
  /** Singular label ("Kafe") */
  label: string;
  /** List page title ("Kafeler") */
  plural: string;
  /** Short line under the title */
  subtitle: string;
  icon: LucideIcon;
  /** Soft icon background + foreground classes */
  tone: string;
};

export const VERTICAL_INFO: Record<Vertical, VerticalInfo> = {
  yemek: {
    label: "Yemek",
    plural: "Yemek",
    subtitle: "Lokanta, ev yemekleri, dürüm ve kebap",
    icon: UtensilsCrossed,
    tone: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  },
  restoran: {
    label: "Restoran",
    plural: "Restoranlar",
    subtitle: "Balık, ocakbaşı ve akşam yemeği",
    icon: ChefHat,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  },
  kafe: {
    label: "Kafe",
    plural: "Kafeler",
    subtitle: "Kahve, kahvaltı ve pastaneler",
    icon: Coffee,
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  otel: {
    label: "Otel",
    plural: "Oteller",
    subtitle: "Konaklama, oda fiyatları ve olanaklar",
    icon: BedDouble,
    tone: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  hizmet: { label: "Hizmet", plural: "Hizmet firmaları", subtitle: "Usta ve hizmet veren firmalar", icon: Wrench, tone: "bg-brand-soft text-primary" },
  magaza: {
    label: "Mağaza",
    plural: "Mağazalar",
    subtitle: "Dükkan ve mağazalar",
    icon: Store,
    tone: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
  },
  etkinlik: {
    label: "Etkinlik",
    plural: "Etkinlikler",
    subtitle: "Konser, tiyatro, atölye ve festivaller",
    icon: Ticket,
    tone: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  },
  diger: { label: "Diğer", plural: "Diğer işletmeler", subtitle: "Diğer işletmeler", icon: Building2, tone: "bg-muted text-muted-foreground" },
};

/** Verticals with their own list page (/firmalar/tur/[tur]). */
export const LISTABLE_VERTICALS: readonly Vertical[] = ["yemek", "restoran", "kafe", "otel", "hizmet", "magaza"];

/** Verticals a business can pick for itself ("etkinlik" is not a business type). */
export const BUSINESS_VERTICALS: readonly Vertical[] = ["yemek", "restoran", "kafe", "otel", "hizmet", "magaza", "diger"];

export function parseVertical(value: unknown): Vertical | null {
  return typeof value === "string" && (VERTICALS as readonly string[]).includes(value) ? (value as Vertical) : null;
}

/** Stored vertical, or a fallback derived from kinds for older rows. */
export function resolveVertical(vertical: unknown, kinds: readonly string[] | null | undefined): Vertical {
  const v = parseVertical(vertical);
  if (v) return v;
  if (kinds?.includes("service")) return "hizmet";
  if (kinds?.includes("shop")) return "magaza";
  return "diger";
}

/** Food businesses get a digital menu + QR menü. */
export function hasMenu(v: Vertical | null | undefined): boolean {
  return v === "yemek" || v === "restoran" || v === "kafe";
}

/** Hotels get rooms. */
export function hasRooms(v: Vertical | null | undefined): boolean {
  return v === "otel";
}

// ---------------------------------------------------------------------------
// Amenities (businesses.amenities)
// ---------------------------------------------------------------------------
type AmenityInfo = { label: string; icon: LucideIcon; for: readonly Vertical[] };

const FOOD: readonly Vertical[] = ["yemek", "restoran", "kafe"];
const ALL: readonly Vertical[] = VERTICALS;

export const AMENITIES: Record<string, AmenityInfo> = {
  wifi: { label: "Ücretsiz Wi-Fi", icon: Wifi, for: ["restoran", "kafe", "otel", "diger"] },
  otopark: { label: "Otopark", icon: Car, for: ALL },
  paket_servis: { label: "Paket servis", icon: ShoppingBag, for: FOOD },
  rezervasyon: { label: "Rezervasyon", icon: CalendarCheck, for: ["restoran", "kafe"] },
  bahce: { label: "Bahçe / teras", icon: Trees, for: [...FOOD, "otel"] },
  cocuk_dostu: { label: "Çocuk dostu", icon: Baby, for: [...FOOD, "otel"] },
  vejetaryen: { label: "Vejetaryen seçenek", icon: Leaf, for: FOOD },
  kahvalti: { label: "Kahvaltı", icon: Croissant, for: ["kafe", "restoran", "otel"] },
  canli_muzik: { label: "Canlı müzik", icon: Music, for: ["restoran", "kafe"] },
  manzara: { label: "Deniz manzarası", icon: Sunset, for: ["restoran", "kafe", "otel"] },
  kredi_karti: { label: "Kredi kartı", icon: CreditCard, for: ALL },
  engelli_erisimi: { label: "Engelli erişimi", icon: Accessibility, for: ALL },
  evcil_hayvan: { label: "Evcil hayvan kabul", icon: PawPrint, for: ["kafe", "otel"] },
  havuz: { label: "Havuz", icon: Waves, for: ["otel"] },
  spor_salonu: { label: "Spor salonu", icon: Dumbbell, for: ["otel"] },
  toplanti_salonu: { label: "Toplantı salonu", icon: Presentation, for: ["otel"] },
  resepsiyon: { label: "7/24 resepsiyon", icon: ConciergeBell, for: ["otel"] },
  oda_servisi: { label: "Oda servisi", icon: BellRing, for: ["otel"] },
  klima: { label: "Klima", icon: AirVent, for: ["otel", "restoran", "kafe"] },
  transfer: { label: "Transfer", icon: Bus, for: ["otel"] },
};

export type AmenityOption = { key: string; label: string; icon: LucideIcon };

export function amenitiesFor(v: Vertical): AmenityOption[] {
  return Object.entries(AMENITIES)
    .filter(([, a]) => a.for.includes(v))
    .map(([key, a]) => ({ key, label: a.label, icon: a.icon }));
}

/** Known amenities of a business in the config order (unknown keys are dropped). */
export function amenityList(keys: readonly string[] | null | undefined): AmenityOption[] {
  if (!keys?.length) return [];
  return Object.entries(AMENITIES)
    .filter(([key]) => keys.includes(key))
    .map(([key, a]) => ({ key, label: a.label, icon: a.icon }));
}

// ---------------------------------------------------------------------------
// Hotel rooms
// ---------------------------------------------------------------------------
export const ROOM_AMENITIES: Record<string, { label: string; icon: LucideIcon }> = {
  wifi: { label: "Wi-Fi", icon: Wifi },
  klima: { label: "Klima", icon: AirVent },
  tv: { label: "TV", icon: Tv },
  minibar: { label: "Minibar", icon: Refrigerator },
  kasa: { label: "Kasa", icon: LockKeyhole },
  balkon: { label: "Balkon", icon: DoorOpen },
  kuvet: { label: "Küvet", icon: Bath },
  sac_kurutma: { label: "Saç kurutma", icon: Wind },
  calisma_masasi: { label: "Çalışma masası", icon: Laptop },
  cay_kahve: { label: "Çay / kahve seti", icon: Coffee },
  manzara: { label: "Deniz manzarası", icon: Sunset },
};

export function roomAmenityList(keys: readonly string[] | null | undefined): AmenityOption[] {
  if (!keys?.length) return [];
  return Object.entries(ROOM_AMENITIES)
    .filter(([key]) => keys.includes(key))
    .map(([key, a]) => ({ key, label: a.label, icon: a.icon }));
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export const MENU_TAGS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  populer: { label: "Popüler", icon: Sparkles, tone: "bg-brand-soft text-primary" },
  yeni: { label: "Yeni", icon: Sparkles, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  vejetaryen: { label: "Vejetaryen", icon: Leaf, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  vegan: { label: "Vegan", icon: Vegan, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  aci: { label: "Acı", icon: Flame, tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" },
  glutensiz: { label: "Glutensiz", icon: WheatOff, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

export const MENU_TAG_KEYS = Object.keys(MENU_TAGS);

// ---------------------------------------------------------------------------
// Price level (1-4)
// ---------------------------------------------------------------------------
export const PRICE_LEVELS: Record<1 | 2 | 3 | 4, { symbol: string; label: string }> = {
  1: { symbol: "₺", label: "Ekonomik" },
  2: { symbol: "₺₺", label: "Orta" },
  3: { symbol: "₺₺₺", label: "Üst segment" },
  4: { symbol: "₺₺₺₺", label: "Lüks" },
};

export function priceLevelInfo(level: number | null | undefined): { symbol: string; label: string } | null {
  return level === 1 || level === 2 || level === 3 || level === 4 ? PRICE_LEVELS[level] : null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export const EVENT_CATEGORIES = ["konser", "tiyatro", "festival", "spor", "cocuk", "sergi", "atolye", "soylesi", "diger"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CATEGORY_INFO: Record<EventCategory, { label: string; icon: LucideIcon }> = {
  konser: { label: "Konser", icon: Music },
  tiyatro: { label: "Tiyatro", icon: Drama },
  festival: { label: "Festival", icon: PartyPopper },
  spor: { label: "Spor", icon: Trophy },
  cocuk: { label: "Çocuk", icon: Baby },
  sergi: { label: "Sergi", icon: Palette },
  atolye: { label: "Atölye", icon: Brush },
  soylesi: { label: "Söyleşi", icon: Mic },
  diger: { label: "Diğer", icon: Ticket },
};

export function parseEventCategory(value: unknown): EventCategory | null {
  return typeof value === "string" && (EVENT_CATEGORIES as readonly string[]).includes(value) ? (value as EventCategory) : null;
}
