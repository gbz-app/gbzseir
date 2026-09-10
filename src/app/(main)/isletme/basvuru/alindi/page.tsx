import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Hourglass, Rocket, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireAuth } from "@/lib/auth/server";
import { routes } from "@/core/routes";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { PushOptIn } from "@/features/profile/components/push-opt-in";

export const metadata: Metadata = { title: "Başvurun Alındı", robots: { index: false } };

const STEPS = [
  { label: "Başvuru", detail: "Tamamlandı", icon: Check, state: "done" },
  { label: "İnceleme", detail: "1 iş günü", icon: Search, state: "current" },
  { label: "Yayında", detail: "Onaydan sonra", icon: Rocket, state: "next" },
] as const;

/** H2: application received. */
export default async function ApplicationReceivedPage() {
  await requireAuth(routes.business.applyDone());
  const business = await getOwnerBusiness();
  if (!business) redirect(routes.business.intro());
  if (business.status === "approved") redirect(routes.business.root());

  return (
    <>
      <PageHeader title="Başvurun alındı" backHref={routes.profile.root()} />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex size-24 items-center justify-center rounded-[2rem] bg-highlight-soft text-highlight-foreground animate-pop dark:text-highlight">
            <Hourglass className="size-11 animate-float" strokeWidth={1.8} aria-hidden />
          </div>
          <h2 className="mt-5 text-2xl font-extrabold text-balance">Başvurun inceleniyor ⏳</h2>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{business.name}</strong> için başvurunu aldık. Genelde 1 iş günü içinde sonuçlanır.
          </p>
        </div>

        <ol className="grid grid-cols-3 gap-2" aria-label="Başvuru süreci">
          {STEPS.map((s) => (
            <li
              key={s.label}
              aria-current={s.state === "current" ? "step" : undefined}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center ring-1",
                s.state === "done" && "bg-success-soft ring-success/20",
                s.state === "current" && "bg-highlight-soft ring-highlight/40",
                s.state === "next" && "bg-card ring-foreground/[0.06]",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full",
                  s.state === "done" && "bg-success text-success-foreground",
                  s.state === "current" && "bg-highlight text-highlight-foreground",
                  s.state === "next" && "bg-muted text-muted-foreground",
                )}
              >
                <s.icon className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-bold">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.detail}</span>
            </li>
          ))}
        </ol>

        <PushOptIn />

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button asChild size="lg">
            <Link href={routes.business.root()}>Başvuru durumunu gör</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href={routes.home()}>Ana sayfaya dön</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
