import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routes, withQuery } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { getOwnListing, safeCategories } from "@/features/listings/server/queries";
import { classifiedDraftFromDetail, type ClassifiedDraft } from "@/features/listings/wizard-drafts";
import { ClassifiedWizard } from "@/features/listings/components/classified-wizard";

export const metadata: Metadata = { title: "2. El İlan Ver", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** E6 - 2. el ilan ver / düzenle (?duzenle=<id>). */
export default async function PostClassifiedPage({ searchParams }: Props) {
  const raw = (await searchParams).duzenle;
  const editParam = typeof raw === "string" && raw ? raw : null;
  const path = editParam ? withQuery(routes.listings.postClassified(), { duzenle: editParam }) : routes.listings.postClassified();
  const { user } = await requireProfile(path);

  const categories = (await safeCategories()).filter((c) => c.type === "classified");
  let initial: ClassifiedDraft | null = null;
  let editId: string | null = null;
  if (editParam) {
    const own = await getOwnListing(user.id, editParam);
    if (!own || own.type !== "classified") notFound();
    editId = own.id;
    initial = classifiedDraftFromDetail(own);
  }

  return <ClassifiedWizard categories={categories} editId={editId} initial={initial} />;
}
