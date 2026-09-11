/**
 * schema.org JSON-LD builders for listing detail pages (Product/Offer and JobPosting).
 */
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { truncate } from "@/core/format";
import type { ListingDetail } from "./types";
import type { ClassifiedViewModel, JobViewModel } from "./view-models";

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path}`);

const CONDITION_SCHEMA: Record<string, string> = {
  sifir: "https://schema.org/NewCondition",
  az_kullanilmis: "https://schema.org/UsedCondition",
  ikinci_el: "https://schema.org/UsedCondition",
  hasarli: "https://schema.org/DamagedCondition",
};

export function productJsonLd(listing: ListingDetail, model: ClassifiedViewModel): Record<string, unknown> {
  const url = abs(routes.listings.classified(listing.id));
  const condition = typeof listing.attributes.durum === "string" ? CONDITION_SCHEMA[listing.attributes.durum] : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: truncate(listing.description || listing.title, 500),
    sku: model.listingNo ?? undefined,
    category: model.categoryTrail || model.categoryName,
    image: listing.media.length ? listing.media.map((m) => m.url) : undefined,
    url,
    offers: {
      "@type": "Offer",
      url,
      price: listing.price ?? 0,
      priceCurrency: "TRY",
      availability: model.state === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      itemCondition: condition,
      priceValidUntil: listing.expires_at.slice(0, 10),
      areaServed: { "@type": "City", name: model.districtName ?? CITY.province },
      seller: model.business
        ? { "@type": "Organization", name: model.business.name, url: model.business.slug ? abs(routes.businesses.detail(model.business.slug)) : undefined }
        : { "@type": "Person", name: model.seller.displayName },
    },
  };
}

const EMPLOYMENT_TYPE: Record<string, string> = {
  tam_zamanli: "FULL_TIME",
  yari_zamanli: "PART_TIME",
  vardiyali: "FULL_TIME",
  stajyer: "INTERN",
  gunluk: "PER_DIEM",
};

const EXPERIENCE_MONTHS: Record<string, number> = { "1-3": 12, "3+": 36 };

export function jobPostingJsonLd(listing: ListingDetail, model: JobViewModel): Record<string, unknown> {
  const company = model.company;
  const description = [model.description, model.qualifications ? `Aranan nitelikler: ${model.qualifications}` : ""].filter(Boolean).join("\n\n");
  const salary =
    model.salaryVisible && (listing.job_salary_min != null || listing.job_salary_max != null)
      ? {
          "@type": "MonetaryAmount",
          currency: "TRY",
          value: {
            "@type": "QuantitativeValue",
            ...(listing.job_salary_min != null ? { minValue: listing.job_salary_min } : {}),
            ...(listing.job_salary_max != null ? { maxValue: listing.job_salary_max } : {}),
            unitText: listing.job_work_type === "gunluk" ? "DAY" : "MONTH",
          },
        }
      : undefined;
  const months = listing.job_experience ? EXPERIENCE_MONTHS[listing.job_experience] : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: listing.title,
    description: description || listing.title,
    datePosted: listing.published_at ?? listing.created_at,
    validThrough: listing.expires_at,
    employmentType: listing.job_work_type ? EMPLOYMENT_TYPE[listing.job_work_type] : undefined,
    directApply: false,
    identifier: model.listingNo ? { "@type": "PropertyValue", name: company?.name ?? APP_NAME, value: model.listingNo } : undefined,
    hiringOrganization: company
      ? {
          "@type": "Organization",
          name: company.name,
          sameAs: company.slug ? abs(routes.businesses.detail(company.slug)) : undefined,
          logo: company.logo_url ?? undefined,
        }
      : undefined,
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: model.locationLabel || undefined,
        addressLocality: model.districtName ?? CITY.province,
        addressRegion: CITY.province,
        addressCountry: "TR",
      },
    },
    baseSalary: salary,
    experienceRequirements: months ? { "@type": "OccupationalExperienceRequirements", monthsOfExperience: months } : undefined,
    industry: model.sectorName ?? undefined,
    jobBenefits: model.benefits.length ? model.benefits.map((b) => b.label).join(", ") : undefined,
    url: abs(routes.listings.job(listing.id)),
  };
}
