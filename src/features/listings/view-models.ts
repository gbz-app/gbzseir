/**
 * View models for the detail views. The same presentational components render the public detail pages
 * (built from DB rows) and the wizard preview step (built from the draft).
 */
import { CONDITIONS, EXPERIENCE_LEVELS, JOB_BENEFITS, WORK_TYPES, optionLabel, type ListingStatus, type Option } from "./constants";
import { formatMonthYear, isPastExpiry, isSalaryVisible, listingNo, salaryText } from "./format";
import { splitJobDescription } from "./job-description";
import type { AttributeField, AttributeValues, BusinessRef, ListingCategory, ListingDetail, MediaRef } from "./types";

export type DisplayState = "live" | "sold" | "filled" | "expired" | "paused" | "pending_review" | "rejected" | "draft" | "deleted";

export function displayState(status: ListingStatus, expiresAt: string): DisplayState {
  if (status === "active") return isPastExpiry(expiresAt) ? "expired" : "live";
  return status;
}

export type AttributeRow = { key: string; label: string; value: string };

export function describeAttributes(schema: AttributeField[], values: AttributeValues): AttributeRow[] {
  const rows: AttributeRow[] = [];
  for (const f of schema) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "") continue;
    let text: string;
    if (f.type === "boolean") {
      if (typeof v !== "boolean") continue;
      text = v ? "Evet" : "Hayır";
    } else if (f.type === "select") {
      text = f.options?.find((o) => o.value === String(v))?.label ?? String(v);
    } else if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      text = Number.isFinite(n) ? n.toLocaleString("tr-TR") : String(v);
    } else {
      text = String(v);
    }
    rows.push({ key: f.key, label: f.label, value: text });
  }
  return rows;
}

export function categoryPath(
  categories: ListingCategory[],
  id: string | null | undefined,
): { category: ListingCategory | null; parent: ListingCategory | null; trail: string } {
  const category = id ? (categories.find((c) => c.id === id) ?? null) : null;
  const parent = category?.parent_id ? (categories.find((c) => c.id === category.parent_id) ?? null) : null;
  const trail = [parent?.name, category?.name].filter(Boolean).join(" › ");
  return { category, parent, trail };
}

export type SellerInfo = { displayName: string; memberSince: string | null };

export type ClassifiedViewModel = {
  /** null in the wizard preview. */
  id: string | null;
  title: string;
  description: string;
  price: number | null;
  categoryName: string;
  categoryTrail: string;
  categorySlug: string | null;
  categoryIcon: string | null;
  conditionLabel: string | null;
  attributes: AttributeRow[];
  neighbourhoodName: string | null;
  postedAt: string | null;
  listingNo: string | null;
  images: MediaRef[];
  seller: SellerInfo;
  business: BusinessRef | null;
  state: DisplayState;
};

export function classifiedModelFromDetail(d: ListingDetail, categories: ListingCategory[]): ClassifiedViewModel {
  const path = categoryPath(categories, d.category_id);
  const schema = path.category?.attributes_schema.length ? path.category.attributes_schema : (d.category?.attributes_schema ?? []);
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    price: d.price,
    categoryName: path.category?.name ?? d.category?.name ?? "İlan",
    categoryTrail: path.trail || d.category?.name || "",
    categorySlug: path.category?.slug ?? d.category?.slug ?? null,
    categoryIcon: path.category?.icon ?? path.parent?.icon ?? null,
    conditionLabel: optionLabel(CONDITIONS, typeof d.attributes.durum === "string" ? d.attributes.durum : null),
    attributes: describeAttributes(schema, d.attributes),
    neighbourhoodName: d.neighbourhoodName,
    postedAt: d.published_at ?? d.created_at,
    listingNo: listingNo(d.id),
    images: d.media.map((m) => ({ url: m.url, thumbUrl: m.thumbUrl })),
    seller: { displayName: d.owner?.display_name || "Gebzem kullanıcısı", memberSince: formatMonthYear(d.owner?.created_at) },
    business: d.business_id ? d.business : null,
    state: displayState(d.status, d.expires_at),
  };
}

export type JobViewModel = {
  id: string | null;
  title: string;
  sectorName: string | null;
  sectorSlug: string | null;
  workTypeLabel: string | null;
  salaryText: string;
  salaryVisible: boolean;
  experienceLabel: string | null;
  benefits: Option[];
  description: string;
  qualifications: string;
  locationLabel: string | null;
  neighbourhoodName: string | null;
  postedAt: string | null;
  listingNo: string | null;
  company: BusinessRef | null;
  state: DisplayState;
};

export function benefitOptions(values: string[]): Option[] {
  return values.map((v) => JOB_BENEFITS.find((b) => b.value === v) ?? { value: v, label: v.charAt(0).toLocaleUpperCase("tr-TR") + v.slice(1) });
}

export function jobModelFromDetail(d: ListingDetail, categories: ListingCategory[]): JobViewModel {
  const path = categoryPath(categories, d.category_id);
  const { description, qualifications } = splitJobDescription(d.description);
  return {
    id: d.id,
    title: d.title,
    sectorName: path.category?.name ?? d.category?.name ?? null,
    sectorSlug: path.category?.slug ?? d.category?.slug ?? null,
    workTypeLabel: optionLabel(WORK_TYPES, d.job_work_type),
    salaryText: salaryText(d.job_salary_min, d.job_salary_max, d.job_salary_hidden),
    salaryVisible: isSalaryVisible(d.job_salary_min, d.job_salary_max, d.job_salary_hidden),
    experienceLabel: optionLabel(EXPERIENCE_LEVELS, d.job_experience),
    benefits: benefitOptions(d.job_benefits),
    description,
    qualifications,
    locationLabel: d.job_location_label,
    neighbourhoodName: d.neighbourhoodName,
    postedAt: d.published_at ?? d.created_at,
    listingNo: listingNo(d.id),
    company: d.business,
    state: displayState(d.status, d.expires_at),
  };
}
