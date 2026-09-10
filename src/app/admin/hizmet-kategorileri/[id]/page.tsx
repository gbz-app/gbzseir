import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FolderTree } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/core/routes";
import { formatDateTime } from "@/core/format";
import { EmptyCard } from "@/features/admin/components/admin-ui";
import { FlowEditor } from "@/features/admin/components/flow-editor/flow-editor";
import type { FlowVersionData } from "@/features/admin/components/flow-editor/version-history";
import { stepsFromUnknown } from "@/features/admin/lib/flow-draft";
import { UUID_RE } from "@/features/admin/lib/zod";

async function loadCategory(id: string) {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_categories")
    .select("id,parent_id,name,slug,active,auto_dispatch,max_providers,notify_pool_size")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/admin/hizmet-kategorileri/[id]">): Promise<Metadata> {
  const { id } = await params;
  const cat = await loadCategory(id);
  return { title: cat ? `${cat.name} · Soru akışı` : "Kategori" };
}

export default async function AdminServiceCategoryPage({ params }: PageProps<"/admin/hizmet-kategorileri/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const cat = await loadCategory(id);
  if (!cat) notFound();
  const supabase = await createClient();

  const back = (
    <Button asChild variant="outline">
      <Link href={routes.admin.serviceCategories()}>
        <ArrowLeft aria-hidden /> Kategoriler
      </Link>
    </Button>
  );

  // Top-level categories have no flow: list their sub-categories instead.
  if (!cat.parent_id) {
    const { data: subs } = await supabase.from("service_categories").select("id,name,slug").eq("parent_id", cat.id).order("sort");
    return (
      <>
        <AdminPageHeader title={cat.name} description="Üst kategori. Soru akışları alt kategoriler için tanımlanır." actions={back} />
        {subs?.length ? (
          <ul className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            {subs.map((s) => (
              <li key={s.id} className="border-b last:border-b-0">
                <Link href={routes.admin.serviceCategory(s.id)} className="flex min-h-14 items-center justify-between gap-3 px-4 hover:bg-muted">
                  <span className="font-semibold">{s.name}</span>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyCard>
            <EmptyState icon={FolderTree} title="Alt kategori yok" />
          </EmptyCard>
        )}
      </>
    );
  }

  const [{ data: parent }, { data: flows }] = await Promise.all([
    supabase.from("service_categories").select("name").eq("id", cat.parent_id).maybeSingle(),
    supabase.from("question_flows").select("id,version,published,created_at,schema").eq("category_id", cat.id).order("version", { ascending: false }),
  ]);

  const versions: FlowVersionData[] = (flows ?? []).map((f) => {
    let steps: FlowVersionData["steps"] = [];
    let invalid = false;
    try {
      steps = stepsFromUnknown(f.schema);
    } catch {
      invalid = true;
    }
    return { id: f.id, version: f.version, published: f.published, created_at: f.created_at, createdLabel: formatDateTime(f.created_at), steps, invalid };
  });

  return (
    <>
      <AdminPageHeader
        title={cat.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {parent?.name ? <span>{parent.name} ›</span> : null}
            <span>Soru akışı düzenleyici</span>
            <Badge variant={cat.auto_dispatch ? "success" : "secondary"}>{cat.auto_dispatch ? "Otomatik eşleştirme" : "Concierge"}</Badge>
            {!cat.active ? <Badge variant="outline">Pasif</Badge> : null}
            <span>· kabul limiti {cat.max_providers} · bildirim havuzu {cat.notify_pool_size}</span>
          </span>
        }
        actions={back}
      />
      <FlowEditor categoryId={cat.id} categoryName={cat.name} versions={versions} />
    </>
  );
}
