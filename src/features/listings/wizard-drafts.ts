/**
 * Draft shapes of the listing wizards and mappers from an existing listing (edit mode). Pure TS (server + client).
 */
import type { UploadedImage } from "@/components/shared/image-uploader";
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
  neighbourhoodId: string | null;
  neighbourhoodName: string | null;
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
  neighbourhoodId: string | null;
  neighbourhoodName: string | null;
};

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
    neighbourhoodId: d.neighbourhood_id,
    neighbourhoodName: d.neighbourhoodName,
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
    neighbourhoodId: d.neighbourhood_id,
    neighbourhoodName: d.neighbourhoodName,
  };
}
