import type { LucideIcon } from "lucide-react";
import { DOCTOR_BRANCH_ICON_NAMES, branchIcon } from "@/features/business/components/doctors/doctor-meta";
import { CATEGORY_ICON_NAMES, categoryIcon } from "@/features/business/lib/category-visuals";
import { VOCAB_ICON_NAMES } from "@/features/business/lib/verticals";
import { GUIDE_ICON_NAMES, guideIcon } from "@/features/guide/lib/constants";

/**
 * Icon sets of the simple category vocabularies on /admin/sozlukler and how the public pages draw each one. Pure TS:
 * the server actions validate against the same lists the editors offer.
 */
export type CategoryKind = "event" | "news" | "place" | "institution" | "branch";

/** Institution categories: the guide icons first, then the shared category icons (guideIcon draws both). */
export const INSTITUTION_ICON_NAMES: readonly string[] = [...new Set([...GUIDE_ICON_NAMES, ...CATEGORY_ICON_NAMES])];

export const CATEGORY_ICON_SETS: Record<CategoryKind, readonly string[]> = {
  event: VOCAB_ICON_NAMES,
  news: CATEGORY_ICON_NAMES,
  place: CATEGORY_ICON_NAMES,
  institution: INSTITUTION_ICON_NAMES,
  branch: DOCTOR_BRANCH_ICON_NAMES,
};

/** Lucide icon of a vocabulary row, drawn the way its public page draws it (branches: branchIcon, institutions: guideIcon). */
export function categoryKindIcon(kind: CategoryKind | undefined, name: string | null | undefined): LucideIcon {
  if (kind === "branch") return branchIcon(name);
  if (kind === "institution") return guideIcon(name);
  return categoryIcon(name);
}
