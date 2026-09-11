/**
 * Draft shapes of the listing wizards and mappers from an existing listing (edit mode). Pure TS (server + client).
 */
import type { UploadedImage } from "@/components/shared/image-uploader";
import { isDistrictSlug, type DistrictSlug } from "@/config/districts";
import { jobLocationByLabel } from "./constants";
import { splitJobDescription } from "./job-description";
import type { AttributeValue, ListingDetail } from "./types";

export type ClassifiedDraft = {
  categoryId: string | null;
  images: UploadedImage[];
  title: string;
  /** Digits only (whole TL). */
  price: string;
  condition: string | null;
  attrs: Record<string, AttributeValue>;
  description: string;
  /** District slug. Missing in drafts saved before districts: read it with draftDistrict(). */
  districtId?: string | null;
  /** @deprecated Neighbourhood of a draft saved before districts; only read by draftDistrict(). */
  neighbourhoodId?: string | null;
  /** Optional video (R2). Missing in drafts saved before video existed. */
  video?: ClassifiedVideoDraft | null;
};

/** A video uploaded in the wizard (public URLs only; never a blob: URL). */
export type ClassifiedVideoDraft = {
  url: string;
  posterUrl: string | null;
  durationS: number;
  width?: number | null;
  height?: number | null;
};

export type JobDraft = {
  sectorId: string | null;
  title: string;
  workType: string | null;
  salaryMin: string;
  salaryMax: string;
  salaryHidden: boolean;
  experience: string | null;
  benefits: string[];
  description: string;
  qualifications: string;
  /** JOB_LOCATIONS key. */
  locationKey: string | null;
  /** District slug (optional for job ads). Missing in drafts saved before districts: read it with draftDistrict(). */
  districtId?: string | null;
  /** @deprecated Neighbourhood of a draft saved before districts; only read by draftDistrict(). */
  neighbourhoodId?: string | null;
};

/** Every neighbourhood the old picker offered was in Gebze (the app covered Gebze only before the Kocaeli update). */
const LEGACY_NEIGHBOURHOOD_DISTRICT: DistrictSlug = "gebze";

/**
 * District of a wizard draft. Drafts restored from localStorage may predate districts: their old neighbourhood pick
 * becomes its district, so the user does not have to choose again.
 */
export function draftDistrict(d: { districtId?: string | null; neighbourhoodId?: string | null }): DistrictSlug | null {
  if (isDistrictSlug(d.districtId)) return d.districtId;
  return d.districtId === undefined && d.neighbourhoodId ? LEGACY_NEIGHBOURHOOD_DISTRICT : null;
}

/** Draft patch for a district pick (also drops an old neighbourhood so it cannot come back). */
export function districtPatch(slug: string | null): { districtId: DistrictSlug | null; neighbourhoodId: null } {
  return { districtId: isDistrictSlug(slug) ? slug : null, neighbourhoodId: null };
}

/** Keep digits only (max 9) for price / salary inputs. */
export function digitsInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

function toImages(d: ListingDetail): UploadedImage[] {
  return [...d.media]
    .sort((a, b) => a.sort - b.sort)
    .map((m) => ({ url: m.url, thumbUrl: m.thumbUrl ?? m.url, path: "", thumbPath: "" }));
}

export function classifiedDraftFromDetail(d: ListingDetail): ClassifiedDraft {
  const { durum, ...rest } = d.attributes;
  return {
    categoryId: d.category_id,
    images: toImages(d),
    title: d.title,
    price: d.price != null ? String(Math.round(d.price)) : "",
    condition: typeof durum === "string" ? durum : null,
    attrs: rest,
    description: d.description,
    districtId: isDistrictSlug(d.district_id) ? d.district_id : null,
    video: d.video ? { url: d.video.url, posterUrl: d.video.posterUrl, durationS: d.video.durationS } : null,
  };
}

export function jobDraftFromDetail(d: ListingDetail): JobDraft {
  const { description, qualifications } = splitJobDescription(d.description);
  return {
    sectorId: d.category_id,
    title: d.title,
    workType: d.job_work_type,
    salaryMin: d.job_salary_min != null ? String(Math.round(d.job_salary_min)) : "",
    salaryMax: d.job_salary_max != null ? String(Math.round(d.job_salary_max)) : "",
    salaryHidden: d.job_salary_hidden,
    experience: d.job_experience,
    benefits: d.job_benefits,
    description,
    qualifications,
    locationKey: jobLocationByLabel(d.job_location_label)?.key ?? null,
    districtId: isDistrictSlug(d.district_id) ? d.district_id : null,
  };
}
