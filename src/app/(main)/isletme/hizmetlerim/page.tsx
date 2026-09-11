import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { WrongVerticalNote } from "@/features/business/components/owner-gate";
import { ServicesManager } from "@/features/business/components/services-manager";
import { getOtherOwnedBusinesses, getOwnerBusiness, getOwnerServices, type OwnerBusiness } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "Hizmetlerim ve fiyatlar", robots: { index: false } };

/**
 * Where incoming requests come from: matching uses the firm's service categories and neighbourhoods (edited on
 * /isletme/duzenle), not this price list. Shown so owners do not look for request settings here.
 */
async function RequestSourceNote({ business }: { business: OwnerBusiness }) {
  let categories: string[] = [];
  if (business.category_ids.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("service_categories").select("name").in("id", business.category_ids).order("sort");
    categories = (data ?? []).map((c) => c.name);
  }
  const areas = business.area_ids.length;

  return (
    <section className="mb-4 rounded-2xl bg-card p-4" aria-labelledby="talep-kaynagi">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <Inbox className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="talep-kaynagi" className="font-semibold">
            Talepler nereden gelir?
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {categories.length
              ? "Müşteri talepleri, seçtiğin hizmet kategorilerine ve mahallelere göre gelir."
              : "Henüz hizmet kategorisi seçmedin. Kategori seçince bu alandaki müşteri talepleri sana gelir."}
          </p>
        </div>
      </div>
      {categories.length || areas ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Talep ayarların">
          {categories.map((name) => (
            <li key={name} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">
              {name}
            </li>
          ))}
          {areas ? <li className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{areas} mahalle</li> : null}
        </ul>
      ) : null}
      <Link href={routes.business.editStep("hizmet-alani")} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
        Kategori ve mahalleleri düzenle
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      <p className="text-xs leading-relaxed text-muted-foreground">Aşağıdaki liste, firma sayfanda görünen fiyat listendir. Talepleri etkilemez.</p>
    </section>
  );
}

/** H8 - Hizmet firmalarının fiyatlı hizmet listesi. */
export default async function OwnerServicesPage() {
  await requireProfile(routes.business.services());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const isService = b.kinds.includes("service") || resolveVertical(b.vertical, b.kinds) === "hizmet";

  return (
    <>
      <PageHeader title="Hizmetlerim ve fiyatlar" subtitle={b.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-10">
        {isService ? (
          <>
            <RequestSourceNote business={b} />
            <ServicesManager businessId={b.id} initial={await getOwnerServices(b.id).catch(() => [])} />
          </>
        ) : (
          <WrongVerticalNote
            text="Fiyatlı hizmet listesi, hizmet veren firmalar içindir."
            alternatives={await getOtherOwnedBusinesses(b.id, (x) => x.vertical === "hizmet" || x.kinds.includes("service"))}
            next={routes.business.services()}
          />
        )}
      </div>
    </>
  );
}
