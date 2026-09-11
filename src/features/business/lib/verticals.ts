/**
 * Business verticals (işletme türü) and the vocabularies that depend on them: amenities, room features,
 * menu tags, price levels, event categories and keşfet chips. Pure TS + lucide icons (server and client safe).
 * Amenities, room features, event categories and chips are admin-managed tables (2026091351_vocabularies.sql):
 * the constants here are their seed and the fallback when the database cannot be read (see vocabularies.ts).
 */
import {
  Accessibility,
  AirVent,
  Baby,
  Bath,
  BedDouble,
  BellRing,
  BookOpen,
  Brush,
  Building2,
  Bus,
  CalendarCheck,
  Camera,
  Car,
  Check,
  ChefHat,
  CigaretteOff,
  Coffee,
  ConciergeBell,
  CreditCard,
  Croissant,
  DoorOpen,
  Drama,
  Dumbbell,
  Film,
  Flame,
  Gamepad2,
  Gem,
  GraduationCap,
  Heart,
  HeartPulse,
  Laptop,
  Leaf,
  LockKeyhole,
  Mic,
  Music,
  Palette,
  PartyPopper,
  PawPrint,
  Pizza,
  Presentation,
  Refrigerator,
  ShoppingBag,
  ShowerHead,
  Sparkles,
  Star,
  Store,
  Sunset,
  Tag,
  Tent,
  Ticket,
  Trees,
  Trophy,
  Tv,
  Utensils,
  UtensilsCrossed,
  Vegan,
  Waves,
  WheatOff,
  Wifi,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { trNormalize } from "@/core/tr";

export const VERTICALS = ["yemek", "restoran", "kafe", "otel", "hizmet", "magaza", "saglik", "dugun", "egitim", "etkinlik", "diger"] as const;
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
  saglik: {
    label: "Sağlık",
    plural: "Sağlık",
    subtitle: "Klinik, diş hekimi, poliklinik ve sağlık hizmetleri",
    icon: HeartPulse,
    tone: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  },
  dugun: {
    label: "Düğün",
    plural: "Düğün",
    subtitle: "Düğün salonu, organizasyon, gelinlik ve fotoğrafçı",
    icon: Gem,
    tone: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  },
  egitim: {
    label: "Eğitim",
    plural: "Eğitim",
    subtitle: "Kurs, etüt, anaokulu ve özel ders",
    icon: GraduationCap,
    tone: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
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
export const LISTABLE_VERTICALS: readonly Vertical[] = ["yemek", "restoran", "kafe", "otel", "hizmet", "magaza", "saglik", "dugun", "egitim"];

/** Verticals a business can pick for itself ("etkinlik" is not a business type). */
export const BUSINESS_VERTICALS: readonly Vertical[] = ["yemek", "restoran", "kafe", "otel", "hizmet", "saglik", "dugun", "egitim", "magaza", "diger"];

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

/** Food businesses and hotels (restaurant, room service) get a digital menu + QR menü. The DB is type-agnostic. */
export function hasMenu(v: Vertical | null | undefined): boolean {
  return v === "yemek" || v === "restoran" || v === "kafe" || v === "otel";
}

/** Hotels get rooms. */
export function hasRooms(v: Vertical | null | undefined): boolean {
  return v === "otel";
}

// ---------------------------------------------------------------------------
// Vocabulary icons (lucide kebab-case names stored in amenities.icon / event_categories.icon)
// ---------------------------------------------------------------------------
const VOCAB_ICONS: Record<string, LucideIcon> = {
  accessibility: Accessibility,
  "air-vent": AirVent,
  baby: Baby,
  bath: Bath,
  "bed-double": BedDouble,
  "bell-ring": BellRing,
  "book-open": BookOpen,
  brush: Brush,
  bus: Bus,
  "calendar-check": CalendarCheck,
  camera: Camera,
  car: Car,
  "chef-hat": ChefHat,
  "cigarette-off": CigaretteOff,
  coffee: Coffee,
  "concierge-bell": ConciergeBell,
  "credit-card": CreditCard,
  croissant: Croissant,
  "door-open": DoorOpen,
  drama: Drama,
  dumbbell: Dumbbell,
  film: Film,
  flame: Flame,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  heart: Heart,
  laptop: Laptop,
  leaf: Leaf,
  "lock-keyhole": LockKeyhole,
  mic: Mic,
  music: Music,
  palette: Palette,
  "party-popper": PartyPopper,
  "paw-print": PawPrint,
  pizza: Pizza,
  presentation: Presentation,
  refrigerator: Refrigerator,
  "shopping-bag": ShoppingBag,
  "shower-head": ShowerHead,
  sparkles: Sparkles,
  star: Star,
  sunset: Sunset,
  tag: Tag,
  tent: Tent,
  ticket: Ticket,
  trees: Trees,
  trophy: Trophy,
  tv: Tv,
  utensils: Utensils,
  vegan: Vegan,
  waves: Waves,
  "wheat-off": WheatOff,
  wifi: Wifi,
  wind: Wind,
  wrench: Wrench,
};

/** Icon names an admin can pick for an amenity or an event category. */
export const VOCAB_ICON_NAMES = Object.keys(VOCAB_ICONS);

export function vocabIcon(name: string | null | undefined, fallback: LucideIcon = Tag): LucideIcon {
  return (name ? VOCAB_ICONS[name] : undefined) ?? fallback;
}

// ---------------------------------------------------------------------------
// Amenities (businesses.amenities) and hotel room features (business_rooms.amenities)
// ---------------------------------------------------------------------------
/** A row of public.amenities: scope business is offered to `verticals`; room features have none. Serializable. */
export type AmenityDef = { key: string; label: string; icon: string | null; verticals: readonly Vertical[]; active: boolean };

const FOOD: readonly Vertical[] = ["yemek", "restoran", "kafe"];
const ALL: readonly Vertical[] = VERTICALS;
const amenity = (key: string, label: string, icon: string, verticals: readonly Vertical[] = []): AmenityDef => ({ key, label, icon, verticals, active: true });

/** Seed / fallback of public.amenities (scope business). */
export const AMENITIES: readonly AmenityDef[] = [
  amenity("wifi", "Ücretsiz Wi-Fi", "wifi", ["restoran", "kafe", "otel", "diger"]),
  amenity("otopark", "Otopark", "car", ALL),
  amenity("paket_servis", "Paket servis", "shopping-bag", FOOD),
  amenity("rezervasyon", "Rezervasyon", "calendar-check", ["restoran", "kafe"]),
  amenity("bahce", "Bahçe / teras", "trees", [...FOOD, "otel"]),
  amenity("cocuk_dostu", "Çocuk dostu", "baby", [...FOOD, "otel"]),
  amenity("vejetaryen", "Vejetaryen seçenek", "leaf", FOOD),
  amenity("kahvalti", "Kahvaltı", "croissant", ["kafe", "restoran", "otel"]),
  amenity("canli_muzik", "Canlı müzik", "music", ["restoran", "kafe"]),
  amenity("manzara", "Deniz manzarası", "sunset", ["restoran", "kafe", "otel"]),
  amenity("kredi_karti", "Kredi kartı", "credit-card", ALL),
  amenity("engelli_erisimi", "Engelli erişimi", "accessibility", ALL),
  amenity("evcil_hayvan", "Evcil hayvan kabul", "paw-print", ["kafe", "otel"]),
  amenity("havuz", "Havuz", "waves", ["otel"]),
  amenity("spor_salonu", "Spor salonu", "dumbbell", ["otel"]),
  amenity("toplanti_salonu", "Toplantı salonu", "presentation", ["otel"]),
  amenity("resepsiyon", "7/24 resepsiyon", "concierge-bell", ["otel"]),
  amenity("oda_servisi", "Oda servisi", "bell-ring", ["otel"]),
  amenity("klima", "Klima", "air-vent", ["otel", "restoran", "kafe"]),
  amenity("transfer", "Transfer", "bus", ["otel"]),
];

/** Seed / fallback of public.amenities (scope room). */
export const ROOM_AMENITIES: readonly AmenityDef[] = [
  amenity("wifi", "Wi-Fi", "wifi"),
  amenity("klima", "Klima", "air-vent"),
  amenity("tv", "TV", "tv"),
  amenity("minibar", "Minibar", "refrigerator"),
  amenity("kasa", "Kasa", "lock-keyhole"),
  amenity("balkon", "Balkon", "door-open"),
  amenity("kuvet", "Küvet", "bath"),
  amenity("sac_kurutma", "Saç kurutma", "wind"),
  amenity("calisma_masasi", "Çalışma masası", "laptop"),
  amenity("cay_kahve", "Çay / kahve seti", "coffee"),
  amenity("manzara", "Deniz manzarası", "sunset"),
];

export type AmenityOption = { key: string; label: string; icon: LucideIcon };

const toOption = (a: AmenityDef): AmenityOption => ({ key: a.key, label: a.label, icon: vocabIcon(a.icon, Check) });

/** Active amenities a business of vertical `v` can pick, in the configured order. */
export function amenitiesFor(v: Vertical, list: readonly AmenityDef[] = AMENITIES): AmenityOption[] {
  return list.filter((a) => a.active && a.verticals.includes(v)).map(toOption);
}

/** Known active amenities of a business in the configured order (unknown keys are dropped). */
export function amenityList(keys: readonly string[] | null | undefined, list: readonly AmenityDef[] = AMENITIES): AmenityOption[] {
  if (!keys?.length) return [];
  return list.filter((a) => a.active && keys.includes(a.key)).map(toOption);
}

/** Active room features an owner can pick. */
export function roomAmenityOptions(list: readonly AmenityDef[] = ROOM_AMENITIES): AmenityOption[] {
  return list.filter((a) => a.active).map(toOption);
}

export function roomAmenityList(keys: readonly string[] | null | undefined, list: readonly AmenityDef[] = ROOM_AMENITIES): AmenityOption[] {
  return amenityList(keys, list);
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
// Service catalog (hizmet firmaları)
// ---------------------------------------------------------------------------
export const SERVICE_UNITS = { is: "iş", saat: "saat", gun: "gün", m2: "m²", adet: "adet", kisi: "kişi", ay: "ay" } as const;
export type ServiceUnit = keyof typeof SERVICE_UNITS;

const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

/** "1.500 TL'den / iş", "400 - 600 TL / saat", "Fiyat için arayın". */
export function formatServicePrice(min: number | null, max: number | null, unit: string): string {
  const u = SERVICE_UNITS[unit as ServiceUnit] ?? unit;
  if (min == null && max == null) return "Fiyat için arayın";
  if (min != null && max != null && max > min) return `${tl.format(min)} - ${tl.format(max)} TL / ${u}`;
  const v = min ?? max!;
  return `${tl.format(v)} TL'den / ${u}`;
}

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
/** events.category: a key of public.event_categories. */
export type EventCategory = string;

/** A row of public.event_categories. Serializable. */
export type EventCategoryDef = { key: string; label: string; icon: string | null; active: boolean };

const eventCategory = (key: string, label: string, icon: string): EventCategoryDef => ({ key, label, icon, active: true });

/** Seed / fallback of public.event_categories. */
export const EVENT_CATEGORIES: readonly EventCategoryDef[] = [
  eventCategory("konser", "Konser", "music"),
  eventCategory("tiyatro", "Tiyatro", "drama"),
  eventCategory("festival", "Festival", "party-popper"),
  eventCategory("spor", "Spor", "trophy"),
  eventCategory("cocuk", "Çocuk", "baby"),
  eventCategory("sergi", "Sergi", "palette"),
  eventCategory("atolye", "Atölye", "brush"),
  eventCategory("soylesi", "Söyleşi", "mic"),
  eventCategory("diger", "Diğer", "ticket"),
];

/** events.category default. */
export const DEFAULT_EVENT_CATEGORY: EventCategory = "diger";

export type EventCategoryInfo = { key: string; label: string; icon: LucideIcon };

/** Label and icon of a category key; a key missing from the list (database unreadable) shows the key itself. */
export function eventCategoryInfo(key: string, list: readonly EventCategoryDef[] = EVENT_CATEGORIES): EventCategoryInfo {
  const c = list.find((x) => x.key === key);
  const label = c?.label ?? (key ? `${key.charAt(0).toLocaleUpperCase("tr-TR")}${key.slice(1).replaceAll("_", " ")}` : "Diğer");
  return { key, label, icon: vocabIcon(c?.icon, Ticket) };
}

export function parseEventCategory(value: unknown): EventCategory | null {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Sub-categories (chips of the /kesfet/[tur] lists)
// ---------------------------------------------------------------------------
export type VerticalSubcategory = {
  key: string;
  label: string;
  /** Matched at a word start after Turkish normalization, so suffixes count ("döner" -> "Dönerci") but mid-word hits do not. */
  keywords: readonly string[];
  /** Phrases removed before matching ("çiğ köfte" is not "köfte"). */
  exclude?: readonly string[];
};

const subcat = (key: string, label: string, keywords: readonly string[], exclude?: readonly string[]): VerticalSubcategory => ({ key, label, keywords, exclude });

/** Seed / fallback of public.vertical_subcategories. */
export const VERTICAL_SUBCATEGORIES: Partial<Record<Vertical, readonly VerticalSubcategory[]>> = {
  yemek: [
    subcat("doner", "Döner", ["döner"]),
    subcat("kebap", "Kebap", ["kebap", "kebab", "dürüm", "adana", "urfa", "iskender"]),
    subcat("lahmacun-pide", "Lahmacun & Pide", ["lahmacun", "pide"]),
    subcat("kofte", "Köfte", ["köfte"], ["çiğ köfte"]),
    subcat("ev-yemekleri", "Ev yemekleri", ["ev yemek", "ev yemeği", "lokanta", "tencere", "sulu yemek"]),
    subcat("cig-kofte", "Çiğ köfte", ["çiğ köfte", "çiğköfte"]),
    subcat("tatli", "Tatlı", ["tatlı", "baklava", "künefe", "kadayıf", "muhallebi", "dondurma"]),
  ],
  restoran: [
    subcat("balik", "Balık", ["balık", "deniz ürün", "levrek", "çipura", "hamsi"]),
    subcat("ocakbasi", "Ocakbaşı", ["ocakbaşı", "ocak başı", "kebap", "kebab", "mangal"]),
    subcat("et-steak", "Et & Steak", ["steak", "et restoran", "et lokanta", "kasap", "bonfile", "antrikot"]),
    subcat("pizza-burger", "Pizza & Burger", ["pizz", "burger", "hamburger", "fast food"]),
    subcat("dunya-mutfagi", "Dünya mutfağı", ["dünya mutfağı", "dünya mutfak", "italyan", "japon", "sushi", "suşi", "meksika", "uzak doğu", "asya", "fransız", "kore", "ramen", "wok"]),
  ],
  kafe: [
    subcat("kahve", "Kahve", ["kahve", "coffee", "espresso", "barista", "üçüncü dalga"]),
    subcat("kahvalti", "Kahvaltı", ["kahvaltı", "serpme", "brunch"]),
    subcat("pastane", "Pastane", ["pastane", "pasta", "fırın", "börek", "patisserie", "baklava", "unlu mamul"]),
    subcat("cay-bahcesi", "Çay bahçesi", ["çay bahçe", "çay evi", "çay ocağı", "semaver"]),
  ],
  otel: [
    subcat("otel", "Otel", ["otel", "hotel"], ["butik otel", "apart otel"]),
    subcat("butik-otel", "Butik otel", ["butik"]),
    subcat("apart", "Apart", ["apart", "rezidans", "residence"]),
    subcat("pansiyon", "Pansiyon", ["pansiyon", "misafirhane", "hostel", "konukevi", "konuk evi"]),
  ],
  hizmet: [
    subcat("temizlik", "Temizlik", ["temizlik", "ev temizliği", "ofis temizliği", "halı yıkama", "koltuk yıkama", "ilaçlama"]),
    subcat("tadilat", "Tadilat", ["tadilat", "dekorasyon", "alçıpan", "fayans", "parke", "seramik", "mutfak dolab", "renovasyon"]),
    subcat("nakliyat", "Nakliyat", ["nakliyat", "nakliye", "taşımacılık", "evden eve", "eşya taşıma", "ofis taşıma"]),
    subcat("elektrik", "Elektrik", ["elektrik", "aydınlatma", "avize", "sigorta panosu"]),
    subcat("tesisat", "Tesisat", ["tesisat", "su kaçağı", "tıkanıklık", "kombi", "petek", "doğalgaz", "doğal gaz"]),
    subcat("boya", "Boya", ["boya", "badana", "duvar kağıdı"]),
  ],
  magaza: [
    subcat("giyim", "Giyim", ["giyim", "butik", "moda", "konfeksiyon", "ayakkabı", "elbise", "çanta"]),
    subcat("elektronik", "Elektronik", ["elektronik", "telefon", "bilgisayar", "tablet", "beyaz eşya", "teknoloji", "televizyon"]),
    subcat("market", "Market", ["market", "süpermarket", "bakkal", "şarküteri", "manav", "kasap", "gıda"]),
    subcat("kirtasiye", "Kırtasiye", ["kırtasiye", "kitap", "kitabevi", "fotokopi", "ofis malzeme"]),
    subcat("mobilya", "Mobilya", ["mobilya", "koltuk", "yatak", "baza", "ev tekstil", "dekorasyon"]),
  ],
  saglik: [
    subcat("dis", "Diş", ["diş hekim", "diş klini", "diş polikli", "ağız ve diş", "dişçi", "dental", "ortodont", "implant"]),
    subcat("goz", "Göz", ["göz merkez", "göz klini", "göz hastal", "göz doktor", "göz hekim", "göz sağlı", "oftalmoloji", "optik", "gözlük"]),
    subcat("poliklinik", "Poliklinik", ["poliklini", "tıp merkez", "sağlık merkez", "dahiliye", "aile hekim"], ["diş poliklini", "diş sağlığı poliklini"]),
    subcat("fizik-tedavi", "Fizik tedavi", ["fizik tedavi", "fizyoterap", "rehabilitasyon", "manuel terapi"]),
    subcat("psikolog", "Psikolog", ["psikolo", "psikoterap", "psikiyatr", "pedagog", "aile danışman"]),
    subcat("veteriner", "Veteriner", ["veteriner", "hayvan hastane", "evcil hayvan", "pet klini", "pet shop"]),
  ],
  dugun: [
    subcat("dugun-salonu", "Düğün salonu", ["düğün salon", "nikah salon", "davet salon", "kır düğün", "balo salon"]),
    subcat("organizasyon", "Organizasyon", ["organizasyon", "kına gece", "sünnet", "süsleme", "doğum günü", "parti"]),
    subcat("gelinlik", "Gelinlik", ["gelinlik", "abiye", "damatlık", "nişanlık", "kınalık", "bindallı"]),
    subcat("fotograf", "Fotoğraf", ["fotoğraf", "video", "stüdyo", "dış çekim", "drone", "klip"]),
    subcat("kuafor", "Kuaför", ["kuaför", "gelin saç", "gelin başı", "makyaj", "güzellik salon", "berber"]),
  ],
  egitim: [
    subcat("kurs", "Kurs", ["kurs", "özel ders", "atölye", "dershane", "robotik", "kodlama"], ["sürücü kurs", "ehliyet kurs"]),
    subcat("dil-okulu", "Dil okulu", ["dil okul", "dil kurs", "yabancı dil", "ingilizce", "almanca", "ielts", "toefl", "yds"]),
    subcat("etut", "Etüt", ["etüt", "etüd", "ödev", "lgs", "yks", "kpss", "birebir ders"]),
    subcat("anaokulu", "Anaokulu", ["anaokul", "kreş", "ana sınıf", "anasınıf", "okul öncesi", "gündüz bakım", "montessori"]),
    subcat("surucu-kursu", "Sürücü kursu", ["sürücü", "ehliyet", "direksiyon"]),
  ],
};

/** Normalized words with a leading space ("Diş Kliniği" -> " dis klinigi"), so " kw" only matches at a word start. */
function wordText(s: string): string {
  return ` ${trNormalize(s).replace(/[^a-z0-9]+/g, " ").trim()}`;
}

/** Matcher of one sub-category chip; pass a business' category_label, name and description joined with spaces. */
export function subcategoryMatcher(sub: VerticalSubcategory): (text: string) => boolean {
  const keywords = sub.keywords.map(wordText);
  const exclude = (sub.exclude ?? []).map(wordText);
  return (text) => {
    let hay = wordText(text);
    for (const x of exclude) hay = hay.replaceAll(x, " ");
    return keywords.some((k) => hay.includes(k));
  };
}
