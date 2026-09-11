/**
 * Types of the city guide (şehir rehberi): resmî kurumlar, ATM / banka, akaryakıt, şarj and the guide places, all rows
 * of public.poi (2026091376_city_guide.sql). Pure TS, safe on the server and in client components.
 */
import type { LucideIcon } from "lucide-react";

/** Poi kinds listed by the guide. "place" details stay on /gezilecek-yerler/[slug]; the others open /kurum/[slug]. */
export type GuideListKind = "institution" | "atm" | "bank" | "fuel" | "ev_charge" | "place";

/** Kinds whose detail page is /kurum/[slug]. */
export type GuideDetailKind = Exclude<GuideListKind, "place">;

/** institution_categories.group_key. */
export type InstitutionGroupKey = "yonetim" | "guvenlik" | "adalet" | "saglik" | "egitim" | "iletisim";

/** details.ownership of an institution. */
export type Ownership = "devlet" | "ozel";

/** A row of public.institution_categories (label_tr as `label`) or its built-in fallback. Serializable. */
export type InstitutionCategoryDef = {
  key: string;
  label: string;
  group: InstitutionGroupKey;
  /** Lucide kebab-case name (resolve with guideIcon). */
  icon: string | null;
  sort: number;
  active: boolean;
};

export type InstitutionGroupDef = { key: InstitutionGroupKey; label: string; icon: LucideIcon };

/** A place_categories subkind ({key, label}, details.subkind). */
export type PlaceSubkindDef = { key: string; label: string };

/** One photo of details.photos with its credit (Wikimedia Commons images carry author, licence and source page). */
export type GuidePhoto = {
  url: string;
  alt: string | null;
  /** Ready-made credit line ("Yazar · CC BY-SA 4.0 · Wikimedia Commons"). */
  credit: string | null;
  author: string | null;
  licence: string | null;
  licenceUrl: string | null;
  /** File page the image comes from (link it next to the credit). */
  sourcePage: string | null;
  /** 1024 px variant (details.photos[].thumb_url) for list cards; `url` stays the original. */
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

/** One EV socket type with its count (details.sockets). */
export type GuideSocket = { type: string; label: string; count: number | null };

/** Parsed poi.details of a guide row. Unknown shapes never throw; missing values are null / []. */
export type GuideDetails = {
  /** institution_categories key (institution) or place_categories key (place). */
  category: string | null;
  /** Finer kind: place subkind (tarihi: cami, kale...; ulasim: tren...) or the source's institution subkind. */
  subkind: string | null;
  ownership: Ownership | null;
  /** Every published number (the first one is also poi.phone). */
  phones: string[];
  fax: string | null;
  hours: string | null;
  description: string | null;
  fee: string | null;
  photos: GuidePhoto[];
  /** BANKS key (atm, bank). */
  bank: string | null;
  /** FUEL_BRANDS key (fuel). */
  brand: string | null;
  /** EV_OPERATORS key (ev_charge). */
  operator: string | null;
  sockets: GuideSocket[];
  powerKw: number | null;
  /** Charging points (ev_charge). */
  capacity: number | null;
  /** ATMs at the same point. */
  atmCount: number | null;
  /** Historic period / build date (tarihi). */
  period: string | null;
  note: string | null;
  /** Why the row is (not) verified, from the research log. */
  verifyNote: string | null;
  osmId: string | null;
  wikidata: string | null;
  /** Stable import key (scripts/db/import-city-guide.mjs). */
  key: string | null;
  curated: boolean;
};

/** A guide row for lists and detail pages. */
export type GuideItem = {
  id: string;
  kind: GuideListKind;
  name: string;
  slug: string;
  /** Detail page (/kurum/<slug>, or /gezilecek-yerler/<slug> for places). */
  href: string;
  address: string | null;
  phone: string | null;
  /** Null when the row has no pin yet (list only, no map). */
  lat: number | null;
  lng: number | null;
  /** districts.id (DistrictSlug), null when unknown. */
  districtId: string | null;
  /** İlçe name, null when unknown. */
  districtName: string | null;
  details: GuideDetails;
  /** Label of the category / bank / brand / operator (admin labels win for categories). */
  categoryLabel: string | null;
  /** Short line under the name: "<categoryLabel> · <ilçe>". */
  subtitle: string | null;
  /** ISO time phone and address were checked against an official source (null: not verified). */
  verifiedAt: string | null;
  sourceUrls: string[];
  email: string | null;
  website: string | null;
  source: string;
  license: string | null;
  updatedAt: string;
};

/** Filters of listGuideItems (every filter is optional except kind). */
export type GuideListOptions = {
  kind: GuideListKind;
  /** Institution group (all of its categories). */
  group?: InstitutionGroupKey | null;
  /** Institution or place category key. */
  category?: string | null;
  subkind?: string | null;
  ownership?: Ownership | null;
  bank?: string | null;
  brand?: string | null;
  operator?: string | null;
  /** District (districts.id, the ?ilce= value). */
  districtId?: string | null;
  /** Free text (name, address, category), accent-insensitive. */
  q?: string | null;
  /** true: only rows with a pin; false: only rows without one (the "konumu eksik" list). */
  hasLocation?: boolean | null;
  /** 1-based. */
  page?: number;
  /** Default 30, max 100. */
  pageSize?: number;
};

export type GuideListResult = {
  items: GuideItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** False when the query failed (items is then empty). */
  ok: boolean;
};

/** Counts for the /rehber hub and the filter chips (visible rows only). */
export type GuideCounts = {
  total: number;
  byKind: Partial<Record<GuideListKind, number>>;
  byInstitutionGroup: Partial<Record<InstitutionGroupKey, number>>;
  byInstitutionCategory: Record<string, number>;
  byOwnership: Partial<Record<Ownership, number>>;
  byPlaceCategory: Record<string, number>;
  /** placeCategory -> subkind -> count. */
  byPlaceSubkind: Record<string, Record<string, number>>;
  /** Bank key -> count, per kind (atm, bank). */
  byBank: { atm: Record<string, number>; bank: Record<string, number> };
  byFuelBrand: Record<string, number>;
  byEvOperator: Record<string, number>;
  /** Rows without a pin, per kind. */
  missingLocation: Partial<Record<GuideListKind, number>>;
  /** GUIDE_SECTIONS slug -> count. */
  bySection: Record<string, number>;
  /** False when the query failed (all counts are then 0). */
  ok: boolean;
};

/** One entry of app_settings.emergency_numbers. */
export type EmergencyNumber = {
  /** Dial string: a short code ("112") or E.164 ("+902626420430"). */
  number: string;
  label: string;
  description: string | null;
  website: string | null;
};

/** Hub block a section belongs to on /rehber. */
export type GuideHub = "kurumlar" | "gunluk" | "gezi";

/** One list page /rehber/<slug>. */
export type GuideSection = {
  slug: string;
  hub: GuideHub;
  kind: GuideListKind;
  /** Chip / tile label. */
  label: string;
  /** Page title. */
  title: string;
  /** One short line (hub tile, meta description). */
  description: string;
  icon: LucideIcon;
  /** Institution sections: the group they list. */
  group?: InstitutionGroupKey;
  /** Place sections: the place category they list. */
  placeCategory?: string;
  /** Sub-filter chip row of the page and its query key (?alt=, ?banka=, ?marka=, ?operator=). */
  subFilter?: { by: "category" | "subkind" | "bank" | "brand" | "operator"; param: string };
};
