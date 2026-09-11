"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { canGoBack } from "@/lib/navigation-history";
import { routes } from "@/core/routes";
import type { ServicePickerData } from "../types";
import { pickedRequestHref } from "../util";
import { PICK_STEP_HELP, PICK_STEP_TITLE, ServicePicker } from "./service-picker";

/**
 * /hizmetler: step 1 of the service request ("what do you need?") in the request Wizard's chrome. The total step
 * count depends on the chosen service, so the header only says "Adım 1". Picking a service opens
 * /hizmet-talebi/<slug>?adim=2&sec=1, where this picker stays the wizard's first step.
 */
export function RequestStart({ data }: { data: ServicePickerData }) {
  const router = useRouter();
  const close = () => (canGoBack() ? router.back() : router.push(routes.home()));

  return (
    <div className="flex min-h-dvh flex-col">
      <HideBottomNav />
      <header className="sticky top-0 z-40 bg-background pt-safe">
        <div className="flex h-(--topbar-h) items-center gap-1 px-2">
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={close} aria-label="Kapat">
            <X className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-bold">Hizmet talebi</p>
            <p className="text-xs font-medium text-muted-foreground">Adım 1</p>
          </div>
        </div>
        <Progress value={10} className="h-1 rounded-none" aria-label="İlerleme: adım 1" />
      </header>

      <section className="flex-1 px-4 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <h1 className="text-[1.6rem] leading-tight font-extrabold text-balance">{PICK_STEP_TITLE}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{PICK_STEP_HELP}</p>
        <div className="mt-6">
          <ServicePicker data={data} hrefFor={(slug) => pickedRequestHref(slug, 2)} />
        </div>
      </section>
    </div>
  );
}
