import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { Button } from "@/components/ui/button";
import { routes } from "@/core/routes";
import { GuideForm } from "@/features/admin/components/guide-form";
import { guideKindFromParam, guideKindParam } from "@/features/admin/lib/guide-admin";
import { one } from "@/features/admin/lib/params";
import { loadGuideVocab } from "@/features/admin/server/guide-data";

export const metadata: Metadata = { title: "Yeni rehber kaydı" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** New city guide record (?tur= preselects the kind, default resmî kurum). */
export default async function AdminGuideNewPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = guideKindFromParam(one(sp.tur)) ?? "institution";
  const supabase = await createClient();
  const vocab = await loadGuideVocab(supabase);
  const back = routes.admin.guide({ tur: guideKindParam(kind) });

  return (
    <>
      <AdminPageHeader
        title="Yeni rehber kaydı"
        description="Eklediğin kayıt uygulamada Şehir Rehberi'nde görünür. Konumu sonra da işaretleyebilirsin."
        actions={
          <Button asChild variant="secondary">
            <Link href={back}>
              <ArrowLeft aria-hidden /> Şehir rehberi
            </Link>
          </Button>
        }
      />
      <GuideForm initialKind={kind} vocab={vocab} backHref={back} />
    </>
  );
}
