import type { BusinessKind } from "@/lib/types";

/** businesses.kinds values in display order. */
export const BUSINESS_KINDS: readonly BusinessKind[] = ["service", "shop", "employer"] as const;

export const KIND_LABELS: Record<BusinessKind, string> = {
  service: "Hizmet veren firma",
  shop: "Dükkan / Mağaza",
  employer: "İşveren",
};

export const KIND_SHORT_LABELS: Record<BusinessKind, string> = {
  service: "Hizmet",
  shop: "Dükkan",
  employer: "İşveren",
};

export const KIND_DESCRIPTIONS: Record<BusinessKind, string> = {
  service: "Temizlik, tadilat, nakliyat, tesisat gibi hizmetler veriyorum; müşteri talepleri almak istiyorum.",
  shop: "Müşterilerin gelip alışveriş yaptığı bir dükkanım, mağazam ya da atölyem var.",
  employer: "Personel arıyorum; işletmem adına iş ilanı vermek istiyorum.",
};

/** Keep only valid kinds (tolerates unknown values and non-arrays). */
export function parseKinds(value: unknown): BusinessKind[] {
  if (!Array.isArray(value)) return [];
  return BUSINESS_KINDS.filter((k) => value.includes(k));
}

export function hasKind(kinds: readonly string[] | null | undefined, kind: BusinessKind): boolean {
  return !!kinds && kinds.includes(kind);
}
