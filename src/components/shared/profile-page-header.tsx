"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { canGoBack } from "@/lib/navigation-history";

/** White round icon button of the profile headers (no shadow, no border). */
export const PROFILE_ROUND_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/** Right-side action of a profile header: white round link with an icon child (e.g. <Plus />). */
export function ProfileHeaderLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} className={PROFILE_ROUND_BUTTON}>
      {children}
    </Link>
  );
}

/** Header of the profile sub pages, same look as /profil: white round back button, big bold title, round actions. */
export function ProfilePageHeader({
  title,
  subtitle,
  backHref = routes.profile.root(),
  actions,
  className,
}: {
  title: string;
  /** Small line under the title (e.g. business name). */
  subtitle?: React.ReactNode;
  /** Where "Geri" goes when there is no in-app history (deep link). */
  backHref?: string;
  /** White round buttons on the right (ProfileHeaderLink). */
  actions?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div className={cn("px-4 pt-safe", className)}>
      <div className="mt-[5px] flex h-(--topbar-h) items-center gap-3">
        <button type="button" aria-label="Geri" onClick={() => (canGoBack() ? router.back() : router.push(backHref))} className={PROFILE_ROUND_BUTTON}>
          <ArrowLeft className="size-5" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[1.75rem] font-bold tracking-tight">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? <p className="-mt-2 truncate pl-14 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
