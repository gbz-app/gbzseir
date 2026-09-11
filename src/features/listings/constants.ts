/**
 * İlanlar modülü sabitleri (saf TS, Expo ile paylaşılabilir).
 * Değerler veritabanındaki check kısıtlarıyla birebir aynıdır (supabase/migrations/20260910000001_init.sql).
 */
import type { ListingsTab } from "@/core/routes";

export const LISTINGS_PAGE_SIZE = 20;
export const MAX_LISTING_PHOTOS = 10;
export const TITLE_MIN = 3;
export const TITLE_MAX = 100;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 4000;
export const JOB_DESCRIPTION_MIN = 20;
export const JOB_DESCRIPTION_MAX = 2500;
export const JOB_QUALIFICATIONS_MAX = 1400;
export const PRICE_MAX = 10_000_000;
export const SALARY_MAX = 2_000_000;
export const SEARCH_MAX = 80;

export type ListingType = "classified" | "job";
export type ListingStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "rejected"
  | "expired"
  | "sold"
  | "filled"
  | "paused"
  | "deleted";

export const TAB_TYPE: Record<ListingsTab, ListingType> = { "ikinci-el": "classified", "is-ilanlari": "job" };
export const TYPE_TAB: Record<ListingType, ListingsTab> = { classified: "ikinci-el", job: "is-ilanlari" };

export type Option<T extends string = string> = { value: T; label: string };

/** attributes.durum (2. el ürün durumu). */
export const CONDITIONS: Option[] = [
  { value: "sifir", label: "Sıfır" },
  { value: "az_kullanilmis", label: "Az kullanılmış" },
  { value: "ikinci_el", label: "İkinci el" },
  { value: "hasarli", label: "Hasarlı / parça" },
];

/** listings.job_work_type */
export const WORK_TYPES: Option[] = [
  { value: "tam_zamanli", label: "Tam zamanlı" },
  { value: "yari_zamanli", label: "Yarı zamanlı" },
  { value: "vardiyali", label: "Vardiyalı" },
  { value: "stajyer", label: "Stajyer" },
  { value: "gunluk", label: "Günlük" },
];

/** listings.job_experience */
export const EXPERIENCE_LEVELS: Option[] = [
  { value: "farketmez", label: "Fark etmez" },
  { value: "0-1", label: "0-1 yıl" },
  { value: "1-3", label: "1-3 yıl" },
  { value: "3+", label: "3 yıl ve üzeri" },
];

/** listings.job_benefits (yan haklar). */
export const JOB_BENEFITS: Option[] = [
  { value: "servis", label: "Servis" },
  { value: "yemek", label: "Yemek" },
  { value: "sgk", label: "SGK" },
  { value: "prim", label: "Prim" },
  { value: "vardiya", label: "Vardiya" },
];

/** listings.job_location_label: OSB / bölge listesi (label DB'ye olduğu gibi yazılır, key URL'de kullanılır). */
export const JOB_LOCATIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: "gosb", label: "GOSB", hint: "Gebze Organize Sanayi Bölgesi" },
  { key: "plastikciler-osb", label: "Gebze Plastikçiler OSB", hint: "Plastikçiler Organize Sanayi Bölgesi" },
  { key: "guzeller-osb", label: "Gebze Güzeller OSB", hint: "Güzeller Organize Sanayi Bölgesi" },
  { key: "dilovasi-osb", label: "Dilovası OSB", hint: "Dilovası Organize Sanayi Bölgesi" },
  { key: "tosb", label: "TOSB", hint: "TAYSAD Organize Sanayi Bölgesi" },
  { key: "merkez", label: "Merkez", hint: "İlçe merkezi ve çevresi" },
];

export type SortKey = "yeni" | "fiyat-artan" | "fiyat-azalan";
export type RpcSort = "newest" | "price_asc" | "price_desc";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string; rpc: RpcSort }> = [
  { value: "yeni", label: "En yeni", rpc: "newest" },
  { value: "fiyat-artan", label: "Fiyat artan", rpc: "price_asc" },
  { value: "fiyat-azalan", label: "Fiyat azalan", rpc: "price_desc" },
];

/** Statuses the owner can open in the edit wizard. */
export const EDITABLE_STATUSES: ListingStatus[] = ["draft", "pending_review", "active", "paused", "rejected", "expired"];

export const BANNED_CATEGORIES_TEXT = "Emlak, vasıta, ilaç, silah, canlı hayvan, alkol ve tütün ilanları verilemez.";
export const SAFETY_TEXT = "Kapora veya ön ödeme göndermeyin, ürünü görmeden ödeme yapmayın.";
export const JOB_SAFETY_TEXT =
  "İşe alım için ücret, kapora ya da kayıt parası istenmesi yasal değildir. Ödeme yapma; şüpheli bir durum görürsen ilanı şikayet et.";

export function optionLabel(options: readonly Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}

export function jobLocationByKey(key: string | null | undefined) {
  return key ? (JOB_LOCATIONS.find((l) => l.key === key) ?? null) : null;
}

export function jobLocationByLabel(label: string | null | undefined) {
  return label ? (JOB_LOCATIONS.find((l) => l.label === label) ?? null) : null;
}
