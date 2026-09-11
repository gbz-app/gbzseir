import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/config/app-mode";
import { formatNumber, formatRelativeTime } from "@/core/format";
import { routes } from "@/core/routes";
import { GUIDE_KIND_META, guideHref } from "@/features/guide/lib/constants";
import { GuideForm, type GuideQueue } from "@/features/admin/components/guide-form";
import { guideKindFromParam, guideKindParam } from "@/features/admin/lib/guide-admin";
import { POI_SOURCES } from "@/features/admin/lib/labels";
import { one } from "@/features/admin/lib/params";
import { UUID_RE } from "@/features/admin/lib/zod";
import { loadGuideRow, loadGuideVocab, missingPinIds } from "@/features/admin/server/guide-data";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Rehber kaydı" };
  const supabase = await createClient();
  const { data } = await supabase.from("poi").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ? `${data.name} · Şehir rehberi` : "Rehber kaydı" };
}

/**
 * Edit one city guide record. ?konum=1 opens the map pin at once; ?sira=konumsuz (+ ?tur) walks the "Konumu eksik"
 * queue: "Kaydet ve sıradaki" saves and opens the next record without a pin.
 */
export default async function AdminGuideItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const inQueue = one(sp.sira) === "konumsuz";
  const queueKind = guideKindFromParam(one(sp.tur));
  const supabase = await createClient();
  const [row, vocab, queueIds] = await Promise.all([
    loadGuideRow(supabase, id),
    loadGuideVocab(supabase),
    inQueue ? missingPinIds(supabase, queueKind) : Promise.resolve(null),
  ]);
  if (!row) notFound();

  const queueParams = { tur: queueKind ? guideKindParam(queueKind) : undefined };
  let queue: GuideQueue | null = null;
  let queueLine: string | null = null;
  if (queueIds) {
    const index = queueIds.indexOf(id);
    const nextId = index >= 0 ? (queueIds[index + 1] ?? null) : (queueIds.find((x) => x !== id) ?? null);
    queue = {
      nextHref: nextId ? routes.admin.guideItem(nextId, { ...queueParams, konum: 1, sira: "konumsuz" }) : null,
      doneHref: routes.admin.guideMissingPins(queueParams),
    };
    queueLine =
      index >= 0 ? `Konumu eksik: ${formatNumber(index + 1)} / ${formatNumber(queueIds.length)}` : `Konumu eksik: ${formatNumber(queueIds.length)} kayıt kaldı`;
  }
  const back = inQueue ? routes.admin.guideMissingPins(queueParams) : routes.admin.guide({ tur: guideKindParam(row.kind) });
  const publicHref = row.hidden ? null : publicUrl(guideHref(row.kind, row.slug));
  const origin = row.sourceRef?.startsWith("guide/") ? "Şehir rehberi verisi" : (POI_SOURCES[row.source] ?? row.source);

  return (
    <>
      <AdminPageHeader
        title={row.name}
        description={
          <>
            {GUIDE_KIND_META[row.kind].label} · {origin} · son değişiklik {formatRelativeTime(row.updatedAt)}
            {queueLine ? (
              <>
                {" "}
                <Badge variant="warning" className="ml-1 align-middle">
                  {queueLine}
                </Badge>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={back}>
                <ArrowLeft aria-hidden /> {inQueue ? "Konumu eksik" : "Şehir rehberi"}
              </Link>
            </Button>
            {publicHref ? (
              <Button asChild variant="secondary">
                <a href={publicHref} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden /> Uygulamada aç
                </a>
              </Button>
            ) : null}
          </>
        }
      />
      <GuideForm key={row.id} value={row} initialKind={row.kind} vocab={vocab} openMap={one(sp.konum) === "1"} queue={queue} backHref={back} />
    </>
  );
}
