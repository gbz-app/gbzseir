import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { PhotosManager } from "@/features/business/components/photos-manager";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";

export const metadata: Metadata = { title: "Fotoğraflar", robots: { index: false } };

/** İşletme fotoğrafları (kapak + portfolyo). */
export default async function BusinessPhotosPage() {
  const { user } = await requireProfile(routes.business.photos());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  // Unfinished / suspended businesses are completed from the panel (an edit here would not publish them).
  if (b.status !== "approved") redirect(routes.business.root());

  return (
    <>
      <PageHeader title="Fotoğraflar" subtitle={b.name} backHref={routes.business.root()} />
      <PhotosManager
        businessId={b.id}
        cover={b.cover_url ? { url: b.cover_url, path: mediaPathFromUrl(b.cover_url, user.id) } : null}
        photos={b.photos.map((p) => ({ id: p.id, url: p.url }))}
      />
    </>
  );
}
