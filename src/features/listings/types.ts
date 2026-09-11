/**
 * İlanlar modülü tipleri ve PostgREST satırlarını uygulama tiplerine çeviren saf yardımcılar.
 */
import type { Json } from "@/lib/database.types";
import type { ListingStatus, ListingType } from "./constants";

export type AttributeFieldType = "text" | "number" | "select" | "boolean";
export type AttributeOption = { value: string; label: string };
/** listing_categories.attributes_schema öğesi. */
export type AttributeField = {
  key: string;
  label: string;
  type: AttributeFieldType;
  options?: AttributeOption[];
  required?: boolean;
  /** Shown as a filter on /ilanlar (select, number, boolean). */
  filterable?: boolean;
};
export type AttributeValue = string | number | boolean;
export type AttributeValues = Record<string, AttributeValue>;

export type ListingCategory = {
  id: string;
  type: ListingType;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort: number;
  attributes_schema: AttributeField[];
};

export type MediaRef = { url: string; thumbUrl: string | null };

/** The listing's optional video (public.listing_videos, one per 2. el listing). */
export type VideoRef = { url: string; posterUrl: string | null; durationS: number };

export type BusinessRef = {
  name: string;
  slug: string | null;
  logo_url: string | null;
  verification_level: number;
  phone?: string | null;
};

/** Kart (liste, ana sayfa) verisi: 2. el ve iş ilanı için ortak. */
export type ListingCardData = {
  id: string;
  type: ListingType;
  title: string;
  price: number | null;
  postedAt: string;
  condition: string | null;
  /** District slug (listings.district_id); null for rows without one. */
  districtId: string | null;
  cover: MediaRef | null;
  categoryIcon: string | null;
  categoryName: string | null;
  isBusiness: boolean;
  workType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryHidden: boolean;
  benefits: string[];
  locationLabel: string | null;
  experience: string | null;
  business: BusinessRef | null;
  /** Örnek (seed) ilan: kartta "Örnek" etiketi. */
  isDemo: boolean;
  /** 2. el ilanın videosu var: kartta "Video" etiketi. */
  hasVideo?: boolean;
};

/** İlan detay sayfası verisi. */
export type ListingDetail = {
  id: string;
  type: ListingType;
  owner_id: string;
  business_id: string | null;
  category_id: string;
  title: string;
  description: string;
  price: number | null;
  attributes: AttributeValues;
  /** District slug (districts.id). */
  district_id: string | null;
  status: ListingStatus;
  rejection_reason: string | null;
  expires_at: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
  call_count: number;
  job_work_type: string | null;
  job_salary_min: number | null;
  job_salary_max: number | null;
  job_salary_hidden: boolean;
  job_experience: string | null;
  job_benefits: string[];
  job_location_label: string | null;
  is_demo: boolean;
  owner: { display_name: string | null; created_at: string | null } | null;
  business: BusinessRef | null;
  category: { name: string; slug: string; parent_id: string | null; attributes_schema: AttributeField[] } | null;
  media: Array<MediaRef & { id?: string; sort: number }>;
  /** listing_videos (2. el only). */
  video?: VideoRef | null;
};

/** "İlanlarım" satırı. */
export type MyListingRow = {
  id: string;
  type: ListingType;
  title: string;
  status: ListingStatus;
  price: number | null;
  rejection_reason: string | null;
  expires_at: string;
  published_at: string | null;
  created_at: string;
  view_count: number;
  call_count: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryHidden: boolean;
  locationLabel: string | null;
  districtId: string | null;
  cover: MediaRef | null;
};

// ---------------------------------------------------------------------------
// Row parsing (defensive: embedded to-one relations may come as object, array or null)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseAttributeSchema(json: Json | unknown): AttributeField[] {
  if (!Array.isArray(json)) return [];
  const out: AttributeField[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Row;
    const key = str(r.key);
    const label = str(r.label);
    const type = r.type;
    if (!key || !label || (type !== "text" && type !== "number" && type !== "select" && type !== "boolean")) continue;
    const options = Array.isArray(r.options)
      ? r.options.flatMap((o) => {
          if (!o || typeof o !== "object") return [];
          const value = str((o as Row).value);
          const optLabel = str((o as Row).label);
          return value && optLabel ? [{ value, label: optLabel }] : [];
        })
      : undefined;
    out.push({ key, label, type, options, required: r.required === true, filterable: r.filterable === true });
  }
  return out;
}

export function parseAttributeValues(json: Json | unknown): AttributeValues {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: AttributeValues = {};
  for (const [k, v] of Object.entries(json as Row)) {
    if (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

export function toCategory(row: Row): ListingCategory {
  return {
    id: String(row.id),
    type: row.type === "job" ? "job" : "classified",
    parent_id: str(row.parent_id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    icon: str(row.icon),
    sort: num(row.sort) ?? 0,
    attributes_schema: parseAttributeSchema(row.attributes_schema),
  };
}

function toMediaList(v: unknown): Array<MediaRef & { id?: string; sort: number }> {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((m) => {
      if (!m || typeof m !== "object") return [];
      const r = m as Row;
      const url = str(r.url);
      if (!url) return [];
      return [{ id: str(r.id) ?? undefined, url, thumbUrl: str(r.thumb_url), sort: num(r.sort) ?? 0 }];
    })
    .sort((a, b) => a.sort - b.sort);
}

function toVideo(v: unknown): VideoRef | null {
  const r = one(v as Row | Row[] | null);
  if (!r || typeof r !== "object") return null;
  const url = str(r.url);
  if (!url) return null;
  return { url, posterUrl: str(r.poster_url), durationS: num(r.duration_s) ?? 0 };
}

function toBusiness(v: unknown): BusinessRef | null {
  const b = one(v as Row | Row[] | null);
  if (!b || typeof b !== "object") return null;
  const name = str(b.name);
  if (!name) return null;
  return {
    name,
    slug: str(b.slug),
    logo_url: str(b.logo_url),
    verification_level: num(b.verification_level) ?? 0,
    phone: str(b.phone),
  };
}

/** Card rows from search_listings / listings with CARD_SELECT. */
export function toCardData(row: Row): ListingCardData {
  const media = toMediaList(row.listing_media);
  const attributes = parseAttributeValues(row.attributes);
  const cat = one(row.listing_categories as Row | Row[] | null);
  return {
    id: String(row.id),
    type: row.type === "job" ? "job" : "classified",
    title: String(row.title ?? ""),
    price: num(row.price_try),
    postedAt: str(row.published_at) ?? str(row.created_at) ?? new Date(0).toISOString(),
    condition: typeof attributes.durum === "string" ? attributes.durum : null,
    districtId: str(row.district_id),
    cover: media[0] ? { url: media[0].url, thumbUrl: media[0].thumbUrl } : null,
    categoryIcon: cat ? str(cat.icon) : null,
    categoryName: cat ? str(cat.name) : null,
    isBusiness: !!row.business_id,
    workType: str(row.job_work_type),
    salaryMin: num(row.job_salary_min),
    salaryMax: num(row.job_salary_max),
    salaryHidden: row.job_salary_hidden === true,
    benefits: strArray(row.job_benefits),
    locationLabel: str(row.job_location_label),
    experience: str(row.job_experience),
    business: toBusiness(row.business),
    isDemo: row.is_demo === true,
    hasVideo: !!one(row.listing_videos as Row | Row[] | null),
  };
}

export function toListingDetail(row: Row): ListingDetail {
  const owner = one(row.owner as Row | Row[] | null);
  const cat = one(row.listing_categories as Row | Row[] | null);
  return {
    id: String(row.id),
    type: row.type === "job" ? "job" : "classified",
    owner_id: String(row.owner_id ?? ""),
    business_id: str(row.business_id),
    category_id: String(row.category_id ?? ""),
    title: String(row.title ?? ""),
    description: str(row.description) ?? "",
    price: num(row.price_try),
    attributes: parseAttributeValues(row.attributes),
    district_id: str(row.district_id),
    status: (str(row.status) ?? "draft") as ListingStatus,
    rejection_reason: str(row.rejection_reason),
    expires_at: str(row.expires_at) ?? new Date(0).toISOString(),
    published_at: str(row.published_at),
    created_at: str(row.created_at) ?? new Date(0).toISOString(),
    updated_at: str(row.updated_at) ?? str(row.created_at) ?? new Date(0).toISOString(),
    view_count: num(row.view_count) ?? 0,
    call_count: num(row.call_count) ?? 0,
    job_work_type: str(row.job_work_type),
    job_salary_min: num(row.job_salary_min),
    job_salary_max: num(row.job_salary_max),
    job_salary_hidden: row.job_salary_hidden === true,
    job_experience: str(row.job_experience),
    job_benefits: strArray(row.job_benefits),
    job_location_label: str(row.job_location_label),
    is_demo: row.is_demo === true,
    owner: owner && typeof owner === "object" ? { display_name: str(owner.display_name), created_at: str(owner.created_at) } : null,
    business: toBusiness(row.business),
    category:
      cat && typeof cat === "object"
        ? {
            name: String(cat.name ?? ""),
            slug: String(cat.slug ?? ""),
            parent_id: str(cat.parent_id),
            attributes_schema: parseAttributeSchema(cat.attributes_schema),
          }
        : null,
    media: toMediaList(row.listing_media),
    video: toVideo(row.listing_videos),
  };
}

export function toMyListingRow(row: Row): MyListingRow {
  const media = toMediaList(row.listing_media);
  return {
    id: String(row.id),
    type: row.type === "job" ? "job" : "classified",
    title: String(row.title ?? ""),
    status: (str(row.status) ?? "draft") as ListingStatus,
    price: num(row.price_try),
    rejection_reason: str(row.rejection_reason),
    expires_at: str(row.expires_at) ?? new Date(0).toISOString(),
    published_at: str(row.published_at),
    created_at: str(row.created_at) ?? new Date(0).toISOString(),
    view_count: num(row.view_count) ?? 0,
    call_count: num(row.call_count) ?? 0,
    salaryMin: num(row.job_salary_min),
    salaryMax: num(row.job_salary_max),
    salaryHidden: row.job_salary_hidden === true,
    locationLabel: str(row.job_location_label),
    districtId: str(row.district_id),
    cover: media[0] ? { url: media[0].url, thumbUrl: media[0].thumbUrl } : null,
  };
}
